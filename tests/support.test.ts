import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupportHandlers } from "../lib/supportHandlers";
import { SupportService } from "../lib/supportService";
import {
  upsertPublicSupport,
  verifiedSupportCompany,
  publicSupportReplyRoute,
} from "../lib/supportPublic";
import {
  fingerprint,
  replyAddress,
  shareSupportTicket,
  supportStatus,
  supportEmailAllowed,
  supportTeamAccess,
  verifyReplyAddress,
  verifySupportMailgun,
} from "../lib/supportPolicy";

type Data = Record<string, any>;
class FakeDb {
  records = new Map<string, Data>();
  tail = Promise.resolve();
  collection(path: string) {
    return new Query(this, path);
  }
  async runTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const writes: Array<() => void> = [];
    try {
      const result = await callback(new Tx(this, writes));
      writes.forEach((write) => write());
      return result;
    } finally {
      release();
    }
  }
}
function snapshot(db: FakeDb, path: string) {
  const data = db.records.get(path);
  return {
    id: path.split("/").at(-1)!,
    exists: !!data,
    data: () => (data ? structuredClone(data) : undefined),
  };
}
function update(db: FakeDb, path: string, patch: Data) {
  const data = { ...(db.records.get(path) || {}) };
  for (const [key, value] of Object.entries(patch)) {
    data[key] =
      value &&
      typeof value === "object" &&
      value.constructor.name === "ArrayUnionTransform"
        ? [...new Set([...(data[key] || []), ...value.elements])]
        : value;
  }
  db.records.set(path, data);
}
class Ref {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
  ) {}
  collection(path: string) {
    return new Query(this.db, `${this.path}/${path}`);
  }
  async get() {
    return snapshot(this.db, this.path);
  }
  async update(patch: Data) {
    update(this.db, this.path, patch);
  }
}
class Query {
  filters: Array<[string, unknown]> = [];
  selected: string[] = [];
  max = Infinity;
  sort = "";
  constructor(
    readonly db: FakeDb,
    readonly path: string,
  ) {}
  doc(id: string) {
    return new Ref(this.db, `${this.path}/${id}`);
  }
  where(key: string, _op: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  select(...keys: string[]) {
    this.selected = keys;
    return this;
  }
  limit(max: number) {
    this.max = max;
    return this;
  }
  orderBy(key: unknown) {
    this.sort = typeof key === "string" ? key : "";
    return this;
  }
  async get() {
    const entries = [...this.db.records.entries()].filter(
      ([path, value]) =>
        path.startsWith(`${this.path}/`) &&
        path.split("/").length === this.path.split("/").length + 1 &&
        this.filters.every(([key, want]) => value[key] === want),
    );
    if (this.sort)
      entries.sort((a, b) =>
        String(a[1][this.sort]).localeCompare(String(b[1][this.sort])),
      );
    const docs = entries.slice(0, this.max).map(([path, data]) => ({
      id: path.split("/").at(-1)!,
      data: () =>
        this.selected.length
          ? Object.fromEntries(
              this.selected
                .filter((key) => key in data)
                .map((key) => [key, data[key]]),
            )
          : structuredClone(data),
    }));
    return {
      docs: docs.map((doc) => ({
        ...doc,
        ref: new Ref(this.db, `${this.path}/${doc.id}`),
      })),
      size: docs.length,
      empty: !docs.length,
    };
  }
}
class Tx {
  constructor(
    readonly db: FakeDb,
    readonly writes: Array<() => void>,
  ) {}
  async get(ref: Ref) {
    return ref.get();
  }
  create(ref: Ref, data: Data) {
    this.writes.push(() => {
      assert.ok(!this.db.records.has(ref.path));
      this.db.records.set(ref.path, structuredClone(data));
    });
  }
  set(ref: Ref, data: Data) {
    this.writes.push(() =>
      this.db.records.set(ref.path, structuredClone(data)),
    );
  }
  update(ref: Ref, data: Data) {
    this.writes.push(() => update(this.db, ref.path, data));
  }
}
const token = "support-test-token-".repeat(3),
  requestId = "00000000-0000-4000-8000-000000000001";
const savedEnv = { ...process.env },
  originalFetch = globalThis.fetch;
let db: FakeDb,
  service: SupportService,
  sent: Array<{ to: string; replyTo: string; body: string; from: string }>;
const company = "company-a",
  ticketId = "existing-ticket";
function ticket(patch: Data = {}) {
  return {
    workspace: "Support Tickets",
    companyId: company,
    projectName: "Update hours",
    description: "Please change our Friday hours.",
    status: "Needs Invoiced",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
    deadline: "2026-10-24",
    billableHours: ".5/hr",
    notes: "Private billing note",
    updates: [{ text: "Internal discussion" }],
    isManual: false,
    email: "owner@example.com",
    contactName: "Owner",
    ...patch,
  };
}
function request(
  path: string,
  method = "GET",
  body?: unknown,
  auth: string | null = token,
) {
  return new NextRequest(`https://crm.example${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function context(extra: Data = {}) {
  return {
    params: Promise.resolve({ resourceId: company, ticketId, ...extra }),
  };
}
function handlers() {
  return createSupportHandlers(
    () => db as never,
    async () => ({
      name: "Agency staff",
      email: "staff@awebco.com",
      direction: "team",
    }),
  );
}

test.beforeEach(() => {
  db = new FakeDb();
  db.records.set(`companies/${company}`, {
    name: "Example client",
    domain: "example.com",
  });
  db.records.set("companies/company-b", { name: "Other client" });
  db.records.set(`tickets/${ticketId}`, ticket());
  db.records.set("users/staff", {
    name: "Agency staff",
    email: "staff@awebco.com",
    role: "admin",
  });
  service = new SupportService(db as never, async (members) => members);
  sent = [];
  process.env.PORTAL_SUPPORT_API_TOKEN = token;
  process.env.MAILGUN_SIGNING_KEY = token;
  process.env.MAILGUN_DOMAIN = "mg.awebco.com";
  process.env.MAILGUN_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://api.mailgun.net/v3/mg.awebco.com/messages",
    );
    assert.equal(init?.redirect, "manual");
    const form = init!.body as FormData;
    sent.push({
      to: String(form.get("to")),
      replyTo: String(form.get("h:Reply-To")),
      body: String(form.get("text")),
      from: String(form.get("from")),
    });
    return Response.json({ id: "accepted" });
  };
});
test.after(() => {
  process.env = savedEnv;
  globalThis.fetch = originalFetch;
});

test("client projection preserves billing dates and hides internal notes, hours, updates and other workspaces", async () => {
  db.records.set("tickets/internal", ticket({ supportVisibility: "internal" }));
  db.records.set("tickets/manual", ticket({ isManual: true }));
  db.records.set("tickets/seo", ticket({ workspace: "SEO" }));
  db.records.set("tickets/other", ticket({ companyId: "company-b" }));
  const list = await service.list(company);
  assert.deepEqual(
    list.map((row) => row.id),
    [ticketId],
  );
  assert.equal(list[0].status, "Completed");
  const detail = await service.detail(ticketId, company);
  for (const field of [
    "deadline",
    "billableHours",
    "notes",
    "updates",
    "email",
    "companyId",
  ])
    assert.ok(!(field in detail));
  assert.equal(JSON.stringify(detail).includes("Private billing"), false);
  assert.equal(db.records.get(`tickets/${ticketId}`)!.deadline, "2026-10-24");
});
test("company and ticket ownership are enforced for detail, reply and attachment download", async () => {
  await assert.rejects(() => service.detail(ticketId, "company-b"), {
    status: 404,
  });
  await assert.rejects(
    () =>
      service.reply(
        ticketId,
        requestId,
        "Hello",
        {
          name: "Other client",
          email: "other@example.com",
          direction: "client",
        },
        [],
        "company-b",
      ),
    { status: 404 },
  );
  await assert.rejects(
    () => service.download(ticketId, requestId, "file", "company-b"),
    { status: 404 },
  );
  assert.equal(sent.length, 0);
});
test("ordinary updates never enter the client conversation; only explicitly shared messages are returned", async () => {
  db.records.set(`tickets/${ticketId}/messages/private`, {
    visibility: "internal",
    direction: "team",
    text: "Internal payroll note",
    created_at: "2026-10-01",
  });
  db.records.set(`tickets/${ticketId}/messages/public`, {
    visibility: "client",
    direction: "team",
    author: "Staff",
    text: "Your update is complete.",
    created_at: "2026-10-01",
    attachments: [],
  });
  const detail = await service.detail(ticketId, company);
  assert.equal(detail.messages.length, 1);
  assert.equal(detail.messages[0].text, "Your update is complete.");
  assert.ok(!JSON.stringify(detail).includes("Internal"));
});
test("creation is durable and idempotent across repeated and simultaneous submissions", async () => {
  const input = {
    request_id: requestId,
    title: "Change business hours",
    description: "Please update Friday business hours.",
    category: "Website Updates" as const,
    priority: "Medium" as const,
    email: "owner@example.com",
    name: "Owner",
    portal_client_id: "portal-client",
    portal_origin: "https://portal.awebco.com" as const,
  };
  const [a, b] = await Promise.all([
    service.create(company, input, []),
    service.create(company, input, []),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    [...db.records.keys()].filter((key) => /^tickets\/[^/]+$/.test(key)).length,
    2,
  );
  assert.equal(sent.length, 2);
  assert.deepEqual(
    new Set(sent.map((mail) => mail.to)),
    new Set(["staff@awebco.com", "owner@example.com"]),
  );
  assert.ok(sent.every((mail) => mail.replyTo.includes("inbound+st.")));
  await assert.rejects(
    () => service.create(company, { ...input, title: "Changed payload" }, []),
    { status: 409 },
  );
});
test("concurrent CRM and portal replies preserve private updates, task status and billing month", async () => {
  const original = structuredClone(db.records.get(`tickets/${ticketId}`));
  const actor = {
    name: "Another authorized contact",
    email: "second@example.com",
    direction: "client" as const,
  };
  await Promise.all([
    service.reply(
      ticketId,
      requestId,
      "Here are more details.",
      actor,
      [],
      company,
    ),
    service.reply(
      ticketId,
      "staff-reply-1",
      "We have completed this.",
      { name: "Staff", email: "staff@awebco.com", direction: "team" },
      [],
    ),
  ]);
  await service.reply(
    ticketId,
    requestId,
    "Here are more details.",
    actor,
    [],
    company,
  );
  const detail = await service.detail(ticketId, company);
  assert.equal(detail.messages.length, 2);
  const after = db.records.get(`tickets/${ticketId}`)!;
  for (const field of [
    "deadline",
    "billableHours",
    "notes",
    "updates",
    "status",
    "updatedAt",
  ])
    assert.deepEqual(after[field], original![field]);
  assert.ok(after.supportParticipants.includes("second@example.com"));
  assert.ok(!JSON.stringify(detail).includes("Internal discussion"));
});
test("timeouts preserve the message without automatically duplicating an uncertain email", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    throw new Error("timeout");
  };
  const actor = {
    name: "Staff",
    email: "staff@awebco.com",
    direction: "team" as const,
  };
  await service.reply(
    ticketId,
    requestId,
    "The requested update is complete.",
    actor,
    [],
  );
  await service.reply(
    ticketId,
    requestId,
    "The requested update is complete.",
    actor,
    [],
  );
  assert.equal(attempts, 1);
  assert.equal(
    db.records.get(`tickets/${ticketId}/messages/${requestId}`)!.email_status,
    "uncertain",
  );
});
test("support API requires its dedicated token before database access", async () => {
  const denied = createSupportHandlers(() => {
    throw new Error("must not read");
  });
  assert.equal(
    (
      await denied.companies(
        request("/api/portal/clients", "GET", undefined, null),
      )
    ).status,
    401,
  );
  process.env.PORTAL_SUPPORT_API_TOKEN = "short";
  assert.equal(
    (await denied.companies(request("/api/portal/clients"))).status,
    503,
  );
});
test("API rejects forged identity fields and refuses a different company even with a valid service token", async () => {
  const api = handlers();
  assert.equal(
    (
      await api.detail(
        request("/api/portal/clients/company-b/tickets/existing-ticket"),
        context({ resourceId: "company-b" }),
      )
    ).status,
    404,
  );
  const result = await api.staffReply(
    request("/api/support/tickets/existing-ticket/messages", "POST", {
      request_id: requestId,
      text: "An update",
      email: "forged@example.com",
    }),
    context(),
  );
  assert.equal(result.status, 400);
  assert.equal(sent.length, 0);
});
test("sharing a manual ticket is deliberate, and requires a company and requester", async () => {
  db.records.set(`tickets/${ticketId}`, ticket({ isManual: true, email: "" }));
  const api = handlers();
  assert.equal(
    (
      await api.visibility(
        request("/api/support/tickets/existing-ticket/sharing", "POST", {
          shared: true,
        }),
        context(),
      )
    ).status,
    400,
  );
  db.records.set(`tickets/${ticketId}`, ticket({ isManual: true }));
  assert.equal(
    (
      await api.visibility(
        request("/api/support/tickets/existing-ticket/sharing", "POST", {
          shared: true,
        }),
        context(),
      )
    ).status,
    200,
  );
  assert.equal((await service.list(company)).length, 1);
});
test("reply addresses are ticket- and recipient-specific and cannot be reused for another sender", () => {
  const address = replyAddress(
    ticketId,
    "owner@example.com",
    "mg.awebco.com",
    token,
  );
  assert.ok(address.split("@")[0].length <= 64);
  assert.equal(
    verifyReplyAddress(address, "owner@example.com", "mg.awebco.com", token),
    ticketId,
  );
  assert.equal(
    verifyReplyAddress(address, "intruder@example.com", "mg.awebco.com", token),
    null,
  );
  assert.equal(
    verifyReplyAddress(
      address,
      "owner@example.com",
      "mg.crm.awebco.com",
      token,
    ),
    null,
  );
  assert.equal(
    verifyReplyAddress(
      address.replace(ticketId, "different-ticket"),
      "owner@example.com",
      "mg.awebco.com",
      token,
    ),
    null,
  );
});
test("Mailgun signatures fail closed when missing, incorrect or stale", () => {
  const timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = "signed-webhook-nonce",
    key = "test-webhook-signing-key";
  const signature = createHmac("sha256", key)
    .update(timestamp + nonce)
    .digest("hex");
  assert.equal(verifySupportMailgun(timestamp, nonce, signature, key), true);
  assert.equal(
    verifySupportMailgun(timestamp, nonce, signature, undefined),
    false,
  );
  assert.equal(
    verifySupportMailgun(
      timestamp,
      nonce,
      signature.replace(/^./, signature[0] === "a" ? "b" : "a"),
      key,
    ),
    false,
  );
  assert.equal(
    verifySupportMailgun(
      timestamp,
      nonce,
      signature,
      key,
      Date.now() + 25 * 3600000,
    ),
    false,
  );
});
test("known statuses normalize without exposing invoicing, and staff need support access", () => {
  assert.equal(supportStatus("Needs Invoiced"), "Completed");
  assert.equal(supportStatus("Awaiting Customer"), "Awaiting your reply");
  assert.equal(supportStatus("Other"), "Status unavailable");
  assert.equal(
    supportTeamAccess({
      role: "staff",
      permissions: { allowedWorkspaces: ["SEO"] },
    }),
    false,
  );
  assert.equal(
    supportTeamAccess({
      role: "staff",
      permissions: { allowedWorkspaces: ["Support Tickets"] },
    }),
    true,
  );
  assert.equal(
    shareSupportTicket(ticket({ supportVisibility: "internal" }), company),
    false,
  );
  assert.notEqual(fingerprint("one"), fingerprint("two"));
});

test("public support intake reuses one ticket across form notifications and webhook retries", async () => {
  db.records.set("contacts/owner", {
    email: "owner@example.com",
    companyId: company,
  });
  const input = {
    entryId: "6038",
    subject: "Ticket #6038 - Change hours",
    description: "Please update Friday hours.",
    email: "owner@example.com",
    contactName: "Owner",
    companyName: "Example client",
    category: "Category: Website Updates",
    priority: "Low",
    files: [],
  };
  const resolve = () => db as never;
  const [a, b] = await Promise.all([
    upsertPublicSupport(input, resolve),
    upsertPublicSupport(input, resolve),
  ]);
  assert.equal(a, b);
  assert.equal(db.records.get(`tickets/${a}`)!.companyId, company);
  assert.equal(sent.length, 0);
  db.records.get(`tickets/${a}`)!.status = "Needs Invoiced";
  db.records.get(`tickets/${a}`)!.deadline = "2026-09-28";
  db.records.get(`tickets/${a}`)!.billableHours = ".5/hr";
  assert.equal(await upsertPublicSupport(input, resolve), a);
  assert.equal(db.records.get(`tickets/${a}`)!.deadline, "2026-09-28");
  assert.equal(db.records.get(`tickets/${a}`)!.status, "Needs Invoiced");
});
test("unregistered or ambiguous public contacts remain unlinked without blocking ticket intake", async () => {
  assert.equal(
    await verifiedSupportCompany(
      db as never,
      "unknown@example.com",
      "Example client",
    ),
    null,
  );
  db.records.set("contacts/one", {
    email: "owner@example.com",
    companyId: company,
  });
  db.records.set("contacts/two", {
    email: "owner@example.com",
    companyId: "company-b",
  });
  assert.equal(
    await verifiedSupportCompany(
      db as never,
      "owner@example.com",
      "Example client",
    ),
    null,
  );
  const id = await upsertPublicSupport(
    {
      entryId: "6040",
      subject: "Ticket #6040 - New request",
      description: "Unregistered requester can still submit.",
      email: "unknown@example.com",
      contactName: "Unknown",
      companyName: "Example client",
      category: "Other",
      priority: "Medium",
      files: [],
    },
    () => db as never,
  );
  assert.ok(!db.records.get(`tickets/${id}`)!.companyId);
});
test("existing public tickets retain their identity, notes, hours and completion date on adoption", async () => {
  const input = {
    entryId: "6038",
    subject: "Ticket #6038 - Change hours",
    description: "Please update Friday hours.",
    email: "owner@example.com",
    contactName: "Owner",
    companyName: "Example client",
    category: "Website Updates",
    priority: "Low",
    files: [],
  };
  db.records.set(
    `tickets/${ticketId}`,
    ticket({ projectName: input.subject, companyName: input.companyName }),
  );
  const id = await upsertPublicSupport(input, () => db as never);
  assert.equal(id, ticketId);
  const record = db.records.get(`tickets/${id}`)!;
  assert.equal(record.deadline, "2026-10-24");
  assert.equal(record.billableHours, ".5/hr");
  assert.equal(record.status, "Needs Invoiced");
  assert.equal(record.notes, "Private billing note");
});
test("public notifications keep unknown destinations unchanged and only route recognized team or requester replies", async () => {
  const resolve = () => db as never;
  assert.equal(
    await publicSupportReplyRoute(ticketId, "asana@example.com", resolve),
    null,
  );
  const client = await publicSupportReplyRoute(
    ticketId,
    "owner@example.com",
    resolve,
  );
  assert.equal(client!.audience, "client");
  assert.equal(
    verifyReplyAddress(
      client!.reply_to,
      "owner@example.com",
      "mg.awebco.com",
      token,
    ),
    ticketId,
  );
  const team = await publicSupportReplyRoute(
    ticketId,
    "staff@awebco.com",
    resolve,
  );
  assert.equal(team!.audience, "team");
  assert.equal(
    verifyReplyAddress(
      team!.reply_to,
      "support-team@awebco.com",
      "mg.awebco.com",
      token,
    ),
    ticketId,
  );
});

test("attachments remain private, survive idempotent retries, and download only through the owning ticket", async () => {
  const objects = new Map<string, Buffer>();
  let writes = 0;
  const storage = () => ({
    file: (path: string) => ({
      save: async (bytes: Buffer, options: any) => {
        assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
        assert.equal(options.metadata.cacheControl, "private, no-store");
        if (objects.has(path)) throw { code: 412 };
        objects.set(path, bytes);
        writes++;
      },
      download: async () => [objects.get(path)!],
    }),
  });
  service = new SupportService(
    db as never,
    async (members) => members,
    storage as never,
  );
  const actor = {
      name: "Staff",
      email: "staff@awebco.com",
      direction: "team" as const,
    },
    file = new File(["Private client attachment"], "client-notes.txt", {
      type: "text/plain",
    });
  const first = await service.reply(
    ticketId,
    requestId,
    "Please review this attachment.",
    actor,
    [file],
  );
  const attachment = first.messages[0].attachments[0];
  assert.ok(!("path" in attachment));
  assert.ok(!("url" in attachment));
  await service.reply(
    ticketId,
    requestId,
    "Please review this attachment.",
    actor,
    [file],
  );
  assert.equal(writes, 1);
  const response = await service.download(
    ticketId,
    requestId,
    attachment.id,
    company,
  );
  assert.equal(await response.text(), "Private client attachment");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.ok(
    response.headers.get("Content-Disposition")!.startsWith("attachment;"),
  );
  await assert.rejects(
    () => service.download(ticketId, requestId, attachment.id, "company-b"),
    { status: 404 },
  );
  await assert.rejects(
    () => service.download(ticketId, "other-message", attachment.id, company),
    { status: 404 },
  );
  assert.ok(
    !JSON.stringify(await service.detail(ticketId, company)).includes(
      `support/${ticketId}/`,
    ),
  );
});

test("preview support email fails closed and only permits the agreed test inbox", () => {
  assert.equal(
    supportEmailAllowed("client@example.com", "preview", undefined),
    false,
  );
  assert.equal(
    supportEmailAllowed("client@example.com", "preview", "troy@awebco.com"),
    false,
  );
  assert.equal(
    supportEmailAllowed("troy@awebco.com", "preview", "troy@awebco.com"),
    true,
  );
  assert.equal(
    supportEmailAllowed("client@example.com", "production", "troy@awebco.com"),
    true,
  );
});

test("CRM replies notify the requester even when the staff member is also the requester", async () => {
  await service.reply(
    ticketId,
    requestId,
    "Explicit client reply",
    { name: "Owner", email: "owner@example.com", direction: "team" },
    [],
  );
  assert.deepEqual(
    sent.map((mail) => mail.to),
    ["owner@example.com"],
  );
  assert.equal(
    db.records.get(`tickets/${ticketId}/messages/${requestId}`)!.email_status,
    "accepted",
  );
  assert.ok(!sent[0].from.includes("inbound+"));
  assert.ok(sent[0].replyTo.includes("inbound+st."));
});
test("preview notifications create delivery records only for the agreed recipient", async () => {
  const oldEnvironment = process.env.VERCEL_ENV,
    oldRecipient = process.env.PORTAL_SUPPORT_PREVIEW_RECIPIENT;
  process.env.VERCEL_ENV = "preview";
  process.env.PORTAL_SUPPORT_PREVIEW_RECIPIENT = "owner@example.com";
  try {
    await service.reply(
      ticketId,
      requestId,
      "Preview client reply",
      { name: "Team", email: "staff@awebco.com", direction: "team" },
      [],
    );
    assert.deepEqual(
      sent.map((mail) => mail.to),
      ["owner@example.com"],
    );
    assert.equal(
      db.records.get(`tickets/${ticketId}/messages/${requestId}`)!.email_status,
      "accepted",
    );
    const count = sent.length;
    await service.reply(
      ticketId,
      "preview-client-reply",
      "Additional client detail",
      { name: "Owner", email: "owner@example.com", direction: "client" },
      [],
      company,
    );
    assert.equal(sent.length, count);
    assert.equal(
      db.records.get(`tickets/${ticketId}/messages/preview-client-reply`)!
        .email_status,
      "not_required",
    );
  } finally {
    if (oldEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnvironment;
    if (oldRecipient === undefined)
      delete process.env.PORTAL_SUPPORT_PREVIEW_RECIPIENT;
    else process.env.PORTAL_SUPPORT_PREVIEW_RECIPIENT = oldRecipient;
  }
});
