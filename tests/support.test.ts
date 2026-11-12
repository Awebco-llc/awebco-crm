import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupportHandlers } from "../lib/supportHandlers";
import { SupportService } from "../lib/supportService";
import { supportEmailOriginal } from "../lib/supportEmail";
import { createPublicSupportWebhook } from "../lib/supportIntake";
import { createSupportInbound } from "../lib/supportInbound";
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
  verifySupportReplyAddress,
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
  async set(data: Data) {
    this.db.records.set(this.path, structuredClone(data));
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
  sent: Array<{
    to: string;
    replyTo: string;
    body: string;
    from: string;
    sender: string;
    html: string;
    attachmentCount: number;
    parent: string;
  }>;
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
  process.env.WEBHOOK_SECRET = token;
  delete process.env.SUPPORT_MAILGUN_DOMAIN;
  delete process.env.MAILGUN_FROM_EMAIL;
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
      sender: String(form.get("h:Sender")),
      html: String(form.get("html")),
      attachmentCount: form.getAll("attachment").length,
      parent: String(form.get("h:In-Reply-To") || ""),
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

test("email replies retain signature images without widening the Portal upload limit", async () => {
  const objects = new Map<string, Buffer>();
  service = new SupportService(
    db as never,
    async (members) => members,
    (() => ({
      file: (path: string) => ({
        save: async (bytes: Buffer) => {
          objects.set(path, bytes);
        },
        download: async () => [objects.get(path)!],
      }),
    })) as never,
  );
  const files = Array.from(
    { length: 7 },
    (_, i) =>
      new File(["email signature image"], `signature-${i}.png`, {
        type: "image/png",
      }),
  );
  const actor = {
    name: "Owner",
    email: "owner@example.com",
    direction: "team" as const,
  };
  await assert.rejects(
    () =>
      service.reply(
        ticketId,
        requestId,
        "Email reply verification",
        actor,
        files,
      ),
    { status: 400 },
  );
  assert.equal(objects.size, 0);
  const result = await service.reply(
    ticketId,
    requestId,
    "Email reply verification",
    actor,
    files,
    undefined,
    { messageId: "<email-fixture@example.com>" },
  );
  assert.equal(result.messages[0].attachments.length, 7);
  assert.equal(objects.size, 7);
  assert.ok(result.messages[0].attachments.every((file) => !("path" in file)));
  await assert.rejects(
    () =>
      service.reply(
        ticketId,
        "over-limit",
        "Too many files",
        actor,
        [...files, ...files, ...files],
        undefined,
        { messageId: "<email-fixture@example.com>" },
      ),
    { status: 400 },
  );
  await assert.rejects(
    () =>
      service.reply(
        ticketId,
        "over-size",
        "Too large",
        actor,
        [
          new File([new Uint8Array(3_000_001)], "large.png", {
            type: "image/png",
          }),
        ],
        undefined,
        { messageId: "<email-fixture@example.com>" },
      ),
    { status: 400 },
  );
});
test("public form categories use their client-facing label without changing CRM data", async () => {
  db.records.get(`tickets/${ticketId}`)!.category =
    "Category: General Questions";
  assert.equal(
    (await service.detail(ticketId, company)).category,
    "General Questions",
  );
  assert.equal(
    db.records.get(`tickets/${ticketId}`)!.category,
    "Category: General Questions",
  );
});

test("incoming email replies never echo back to their own sender", async () => {
  await service.reply(
    ticketId,
    "email-owner-reply",
    "My reply",
    { name: "Owner", email: "owner@example.com", direction: "team" },
    [],
    undefined,
    { messageId: "<owner-reply@example.com>" },
  );
  assert.equal(sent.length, 0);
  assert.equal(
    db.records.get(`tickets/${ticketId}/messages/email-owner-reply`)!
      .email_status,
    "not_required",
  );
  assert.equal(
    db.records.get(`tickets/${ticketId}`)!.supportLastEmailMessageId,
    "<owner-reply@example.com>",
  );
});
test("forwarded replies use matching Awebco sender branding, thread headers, and real attachments only", async () => {
  const objects = new Map<string, Buffer>();
  service = new SupportService(
    db as never,
    async (members) => members,
    (() => ({
      file: (path: string) => ({
        save: async (bytes: Buffer) => {
          objects.set(path, bytes);
        },
        download: async () => [objects.get(path)!],
      }),
    })) as never,
  );
  const raw =
    "Your update is complete.\n\n[cid:logo]\nJamie Client\nSupport specialist\n(217) 555-0100\nhttps://example.com/";
  const files = [
    new File(["inline logo"], "logo.png", { type: "image/png" }),
    new File(["real report"], "report.pdf", { type: "application/pdf" }),
  ];
  await service.reply(
    ticketId,
    "email-staff-reply",
    raw,
    { name: "Jamie", email: "staff@awebco.com", direction: "team" },
    files,
    undefined,
    {
      messageId: "<staff-reply@example.com>",
      original: {
        plain: raw,
        html: [],
        strippedHtml: [],
        contentIds: { logo: "attachment-1" },
        strippedSignature: raw.split("\n\n")[1],
      },
      attachmentCids: [["logo"], []],
    },
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].from, "Awebco Support <tickets@awebco.com>");
  assert.equal(sent[0].attachmentCount, 1);
  assert.equal(sent[0].parent, "<staff-reply@example.com>");
  assert.ok(!sent[0].body.includes("[cid:"));
  assert.ok(!sent[0].body.includes("Support specialist"));
  assert.ok(!sent[0].body.includes("staging-portal"));
  assert.ok(sent[0].html.includes("View your support ticket"));
  const detail = await service.detail(ticketId, company);
  assert.equal(detail.messages[0].text, "Your update is complete.");
  assert.equal(detail.messages[0].attachments.length, 1);
  assert.equal(detail.messages[0].inline_attachments!.length, 1);
  assert.match(detail.messages[0].email_signature!, /Jamie Client/);
  assert.ok(!JSON.stringify(detail).includes("support/"));
  assert.equal(db.records.get(`tickets/${ticketId}`)!.deadline, "2026-10-24");
});

test("support uses the public ticket identity without inheriting CRM Notifications or changing the relay and reply route", async () => {
  process.env.MAILGUN_DOMAIN = "mg.crm.awebco.com";
  process.env.MAILGUN_FROM_EMAIL = "CRM Notifications <noreply@mg.awebco.com>";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(
      String(url),
      "https://api.mailgun.net/v3/mg.crm.awebco.com/messages",
    );
    const form = init!.body as FormData;
    assert.equal(form.get("from"), "Awebco Support <tickets@awebco.com>");
    assert.equal(form.getAll("inline").length, 0);
    assert.equal(form.get("h:Auto-Submitted"), null);
    assert.equal(form.get("h:X-Auto-Response-Suppress"), null);
    assert.match(String(form.get("html")), /View your support ticket/);
    assert.match(String(form.get("h:Reply-To")), /@mg\.crm\.awebco\.com$/);
    return Response.json({ id: "accepted" });
  };
  await service.reply(
    ticketId,
    crypto.randomUUID(),
    "Transport verification",
    { name: "Agency staff", email: "staff@awebco.com", direction: "team" },
    [],
  );
  assert.equal(calls, 1);
});

test("a requester who also has CRM access receives one client confirmation with the portal link", async () => {
  db.records.set("users/requester-staff", {
    name: "Owner",
    email: "owner@example.com",
    role: "admin",
  });
  await service.create(
    company,
    {
      request_id: requestId,
      title: "Requester confirmation",
      description: "Please verify the requester confirmation.",
      category: "General Questions",
      priority: "Low",
      email: "owner@example.com",
      name: "Owner",
      portal_client_id: "portal-client",
      portal_origin: "https://portal.awebco.com",
    },
    [],
  );
  const confirmation = sent.filter((mail) => mail.to === "owner@example.com");
  assert.equal(confirmation.length, 1);
  assert.match(confirmation[0].body, /We received your request/);
  assert.match(confirmation[0].html, /View your support ticket/);
  assert.ok(!confirmation[0].body.includes("awebco-crm.vercel.app"));
});

test("retained email originals and downloads remain tenant scoped and leave billing untouched", async () => {
  const form = new FormData();
  const raw =
    "Top reply.\nOn Friday, Awebco wrote:\n> Old question\nKeep the red photo.\n> Older question";
  const html =
    "<div>Top reply.</div><blockquote>Old question</blockquote><div>Keep the red photo.</div><blockquote>Older question</blockquote>";
  form.set("body-plain", raw);
  form.set("body-html", html);
  form.set("stripped-text", "Top reply.");
  const original = supportEmailOriginal(form);
  const before = structuredClone(db.records.get(`tickets/${ticketId}`));
  await service.reply(
    ticketId,
    "email-original-test",
    raw,
    { name: "Owner", email: "owner@example.com", direction: "client" },
    [],
    company,
    { messageId: "<original@example.com>", original },
  );
  assert.deepEqual(
    db.records.get(`tickets/${ticketId}/messages/email-original-test`)!
      .email_original,
    original,
  );
  const detail = await service.detail(ticketId, company);
  const message = detail.messages[0];
  assert.equal(message.email_original_text, raw);
  assert.match(message.text, /Keep the red photo/);
  assert.match(message.email_quoted!, /Old question/);
  const download = await service.download(
    ticketId,
    message.id,
    "original-email",
    company,
  );
  assert.deepEqual(await download.json(), original);
  assert.equal(
    download.headers.get("Content-Type"),
    "application/json; charset=utf-8",
  );
  assert.match(download.headers.get("Content-Disposition")!, /attachment/);
  await assert.rejects(() =>
    service.download(ticketId, message.id, "original-email", "another-company"),
  );
  const after = db.records.get(`tickets/${ticketId}`)!;
  for (const key of [
    "status",
    "hours",
    "deadline",
    "updatedAt",
    "invoiced",
    "completedAt",
  ])
    assert.deepEqual(after[key], before![key]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Keep the red photo/);
  assert.ok(!sent[0].body.includes("> Old question"));
});

test("a Mailgun replay of a legacy message never rewrites originals or retries old failed notifications", async () => {
  const actor = {
    name: "Owner",
    email: "owner@example.com",
    direction: "client" as const,
  };
  await service.reply(
    ticketId,
    "email-legacy-replay",
    "Original stripped reply.",
    actor,
    [],
    company,
    { messageId: "<replay@example.com>" },
  );
  const ref = `tickets/${ticketId}/messages/email-legacy-replay`;
  const before = structuredClone(db.records.get(ref)!);
  before.email_status = "failed";
  db.records.set(ref, before);
  const count = sent.length;
  await service.reply(
    ticketId,
    "email-legacy-replay",
    "Original stripped reply.\nRepeated email history now retained by the new receiver.",
    actor,
    [],
    company,
    { messageId: "<replay@example.com>" },
  );
  assert.deepEqual(db.records.get(ref), before);
  assert.equal(sent.length, count);
});

test("authenticated public form webhook preserves feed 28 and connector payloads without requiring a registered requester", async () => {
  const payload = {
    subject: 'Ticket #8123 - TEST — Please ignore',
    body: 'We’re checking the support ticket system. No action is needed.',
    name: 'New requester', email: 'new-person@example.net', company: 'Unregistered company',
    category: 'Category: General Questions', priority: 'Low', uploads: 'https://awebco.com/download?gf-download=upload.pdf',
  };
  const resolve = () => db as never;
  const post = createPublicSupportWebhook(() => [], (input) => upsertPublicSupport(input, resolve), (id, to) => publicSupportReplyRoute(id, to, resolve));
  const req = (body: unknown, header = false) => new Request(`https://crm.example/api/tickets/webhook${header ? '' : `?secret=${token}`}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(header ? { 'x-webhook-secret': token } : {}) }, body: JSON.stringify(body),
  });
  const legacy = await post(req(payload));
  assert.equal(legacy.status, 200);
  const id = (await legacy.json()).ticketId;
  const upgraded = await post(req({ ...payload, form_id: 80, entry_id: '8123', support_route: true, notification_to: payload.email }, true));
  assert.equal(upgraded.status, 200);
  const result = await upgraded.json();
  assert.equal(result.ticketId, id);
  assert.equal(result.routing, undefined);
  const saved = db.records.get(`tickets/${id}`)!;
  assert.equal(saved.email, payload.email);
  assert.equal(saved.companyId, undefined);
  assert.equal(saved.category, 'General Questions');
  assert.equal(saved.supportEntryId, '8123');
  assert.equal(saved.files[0].name, 'upload.pdf');
  assert.equal([...db.records.keys()].filter((path) => path.startsWith('tickets/')).length, 2);
});

test("public form webhook rejects generic email creation, bad provenance and malformed requests before any ticket write", async () => {
  let writes = 0;
  const post = createPublicSupportWebhook(() => [], async () => { writes++; return 'unexpected'; });
  const base = { subject: 'Ticket #8123 - Help', body: 'Please help', name: 'Troy', email: 'troy@awebco.com', company: 'Awebco', category: 'Other', priority: 'Low' };
  for (const body of [
    { subject: 'Unrelated site notification', from: 'wordpress@example.net', body: 'Lockout notice' },
    { ...base, subject: 'An unrelated email' },
    { ...base, form_id: 81, entry_id: '8123' },
    { ...base, form_id: 80, entry_id: '9999' },
    { ...base, form_id: 80 },
    { ...base, entry_id: '8123' },
    { ...base, email: '' },
    { ...base, body: { text: 'wrong type' } },
    [], null,
  ]) {
    const response = await post(new Request(`https://crm.example/api/tickets/webhook?secret=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
  }
  for (const secret of ['', 'wrong-secret', 'é'.repeat(token.length)]) {
    assert.equal((await post(new Request(`https://crm.example/api/tickets/webhook?secret=${encodeURIComponent(secret)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base) }))).status, 401);
  }
  assert.equal((await post(new Request(`https://crm.example/api/tickets/webhook?secret=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await post(new Request(`https://crm.example/api/tickets/webhook?secret=${token}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(base) }))).status, 415);
  assert.equal((await post(new Request(`https://crm.example/api/tickets/webhook?secret=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...base, body: 'a'.repeat(512001) }) }))).status, 413);
  assert.equal(writes, 0);
});

test("new support domain sends matching Sender/From while old signed replies remain valid and tenant-bound", async () => {
  process.env.MAILGUN_DOMAIN = 'mg.crm.awebco.com';
  process.env.SUPPORT_MAILGUN_DOMAIN = 'mg.awebco.com';
  const owner = 'owner@example.com';
  await service.sendEmail(ticketId, ticket(), requestId, { author: 'Awebco', text: 'Test reply', visibility: 'client' }, owner, 'client');
  assert.equal(sent[0].sender, sent[0].from);
  assert.equal(sent[0].from, 'Awebco Support <tickets@awebco.com>');
  assert.ok(sent[0].replyTo.endsWith('@mg.awebco.com'));
  for (const domain of ['mg.crm.awebco.com', 'mg.awebco.com']) {
    const address = replyAddress(ticketId, owner, domain, token);
    assert.equal(verifySupportReplyAddress(address, owner, token), ticketId);
    assert.equal(verifySupportReplyAddress(address, 'another@example.com', token), null);
    assert.equal(verifySupportReplyAddress(address, owner, 'wrong-key'.repeat(8)), null);
  }
  assert.equal(verifySupportReplyAddress(replyAddress(ticketId, owner, 'other.example.com', token), owner, token), null);
  const route = await publicSupportReplyRoute(ticketId, owner, () => db as never);
  assert.ok(route!.reply_to.endsWith('@mg.awebco.com'));
});

test("signed incoming client and staff replies use the same ticket across new and legacy mail domains without duplicates", async () => {
  process.env.MAILGUN_DOMAIN = 'mg.crm.awebco.com';
  process.env.SUPPORT_MAILGUN_DOMAIN = 'mg.awebco.com';
  const receive = createSupportInbound(() => service, async () => true);
  const input = (sender: string, recipient: string, id: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'test-inbound-nonce';
    const formData = new FormData();
    formData.set('Message-Id', `<${id}@example.com>`);
    formData.set('body-plain', 'This is an approved test reply.');
    formData.set('from', sender);
    return { sender, recipient, body: 'This is an approved test reply.', timestamp, token: nonce, signature: createHmac('sha256', token).update(timestamp + nonce).digest('hex'), formData };
  };
  const owner = 'owner@example.com';
  const legacy = input(owner, replyAddress(ticketId, owner, 'mg.crm.awebco.com', token), 'legacy-client');
  assert.equal((await receive(legacy)).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'staff@awebco.com');
  assert.ok(sent[0].replyTo.endsWith('@mg.awebco.com'));
  assert.equal((await receive(legacy)).status, 200);
  assert.equal(sent.length, 1);
  const team = input('staff@awebco.com', replyAddress(ticketId, 'support-team@awebco.com', 'mg.awebco.com', token), 'new-staff');
  assert.equal((await receive(team)).status, 200);
  assert.equal(sent.at(-1)!.to, owner);
  assert.equal(sent.at(-1)!.sender, 'Awebco Support <tickets@awebco.com>');
  const detail = await service.detail(ticketId, company);
  assert.equal(detail.messages.length, 2);
  assert.deepEqual(detail.messages.map((m) => m.direction), ['client', 'team']);
  const saved = db.records.get(`tickets/${ticketId}`)!;
  assert.equal(saved.status, 'Needs Invoiced');
  assert.equal(saved.deadline, '2026-10-24');
  assert.equal(saved.notes, 'Private billing note');
  assert.equal([...db.records.keys()].filter((p) => /^tickets\/[^/]+$/.test(p)).length, 1);
  const untrusted = input('outsider@example.net', replyAddress(ticketId, 'outsider@example.net', 'mg.awebco.com', token), 'outsider');
  assert.equal((await receive(untrusted)).status, 403);
  assert.equal((await receive({ ...legacy, signature: '0'.repeat(64) })).status, 401);
  assert.equal((await receive({ ...legacy, recipient: legacy.recipient.replace(ticketId, 'another-ticket') })).status, 403);
  const revoked = createSupportInbound(() => service, async () => false);
  assert.equal((await revoked(team)).status, 403);
  db.records.set(`tickets/${ticketId}`, { ...saved, supportVisibility: 'internal' });
  assert.equal((await receive(legacy)).status, 404);
  assert.equal(sent.length, 2);
});

test("incoming replies preserve case-sensitive manual ticket IDs on new and legacy domains", async () => {
  process.env.MAILGUN_DOMAIN = 'mg.crm.awebco.com';
  process.env.SUPPORT_MAILGUN_DOMAIN = 'mg.awebco.com';
  const manualId = 'ManualTicketAbC123xyz';
  db.records.set(`tickets/${manualId}`, ticket());
  const receive = createSupportInbound(() => service, async () => true);
  const owner = 'owner@example.com';
  for (const domain of ['mg.awebco.com', 'mg.crm.awebco.com']) {
    const recipient = replyAddress(manualId, owner, domain, token);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = `case-test-${domain}`;
    const formData = new FormData();
    formData.set('Message-Id', `<case-test-${domain}@example.com>`);
    formData.set('body-plain', 'This reply belongs on the manual ticket.');
    const input = { sender: owner, recipient: `Awebco Support <${recipient}>`, body: 'This reply belongs on the manual ticket.', timestamp, token: nonce, signature: createHmac('sha256', token).update(timestamp + nonce).digest('hex'), formData };
    assert.equal((await receive(input)).status, 200);
    assert.equal((await receive(input)).status, 200);
    assert.equal((await receive({ ...input, recipient: recipient.replace(manualId, manualId.toLowerCase()) })).status, 403);
  }
  const messages = (await service.detail(manualId, company)).messages;
  assert.equal(messages.length, 2);
  assert.equal(db.records.has(`tickets/${manualId.toLowerCase()}`), false);
});

test("website form intake keeps direct replies even for known CRM companies", async () => {
  for (const patch of [
    { supportSource: "awebco.com" },
    { projectName: "Ticket #6104 - Website update" },
  ]) {
    db.records.set(`tickets/${ticketId}`, ticket(patch));
    for (const to of ["owner@example.com", "staff@awebco.com", "unknown@example.net"]) {
      assert.equal(await publicSupportReplyRoute(ticketId, to, () => db as never), null);
    }
  }
});

test("already issued public-form relay addresses hand off to direct email without portal prompts", async () => {
  db.records.set(`tickets/${ticketId}`, ticket({ supportSource: "awebco.com" }));
  process.env.MAILGUN_DOMAIN = "mg.crm.awebco.com";
  process.env.SUPPORT_MAILGUN_DOMAIN = "mg.awebco.com";
  const receive = createSupportInbound(() => service, async () => true);
  for (const domain of ["mg.crm.awebco.com", "mg.awebco.com"]) {
    for (const sender of ["owner@example.com", "staff@awebco.com"]) {
      const staff = sender.startsWith("staff");
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = `legacy-form-${domain}-${sender}`;
      const formData = new FormData();
      formData.set("Message-Id", `<${nonce}@example.com>`);
      formData.set("body-plain", "Please update the website hours.");
      const input = { sender, recipient: replyAddress(ticketId, staff ? "support-team@awebco.com" : sender, domain, token), body: "Please update the website hours.", timestamp, token: nonce, signature: createHmac("sha256", token).update(timestamp + nonce).digest("hex"), formData };
      assert.equal((await receive(input)).status, 200);
      const mail = sent.at(-1)!;
      assert.equal(mail.to, staff ? "owner@example.com" : "staff@awebco.com");
      assert.equal(mail.replyTo, staff ? "staff@awebco.com" : "owner@example.com");
      if (staff) {
        assert.doesNotMatch(mail.body + mail.html, /portal\.awebco\.com|View your support ticket|Internal notes|href=""/);
        assert.match(mail.body, /Please update the website hours/);
      }
      const count = sent.length;
      assert.equal((await receive(input)).status, 200);
      assert.equal(sent.length, count);
    }
  }
});

test("profile corrections and photos apply to existing ticket conversations and both notification audiences without crossing companies", async () => {
  const api = handlers();
  const profile = {
    email: "owner@example.com",
    name: "Corrected Client",
    image: "data:image/jpeg;base64,/9j/2Q==",
    direction: "client",
  };
  assert.equal(
    (
      await api.profile(
        request("/api/portal/clients/company-a/profile", "POST", profile, null),
        context(),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await api.profile(
        request("/api/portal/clients/company-a/profile", "POST", {
          ...profile,
          direction: "admin",
        }),
        context(),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api.profile(
        request("/api/portal/clients/company-a/profile", "POST", profile),
        context(),
      )
    ).status,
    200,
  );
  await service.reply(
    ticketId,
    requestId,
    "Looks good.",
    { email: profile.email, name: "oldname", direction: "client" },
    [],
    company,
  );
  const conversation = await service.detail(ticketId, company);
  assert.equal(conversation.messages[0].author, profile.name);
  assert.equal(conversation.messages[0].author_image, profile.image);
  assert.ok(sent.some((message) => message.body.includes(profile.name)));
  assert.equal(
    await service.profile("company-b", profile.email, profile.direction),
    null,
  );
  assert.equal(await service.profile(company, profile.email, "team"), null);
});

test('ticket references allocate once across concurrent reads and creation sources without changing legacy identity', async () => {
  const { ensureSupportNumber } = await import('../lib/supportNumbers');
  const legacy = 'legacy-reference';
  db.records.set(`tickets/${legacy}`, ticket({projectName:'Ticket #6148 - Change hours', completedAt:'2026-10-24T14:00:00Z'}));
  const before = structuredClone(db.records.get(`tickets/${legacy}`));
  const values = await Promise.all(Array.from({length: 5}, () => ensureSupportNumber(db as never, legacy)));
  assert.equal(new Set(values.map(value => value?.ticketNumber)).size, 1);
  assert.match(String(values[0]?.ticketNumber), /^AW-\d{6}$/);
  assert.equal(db.records.get(`tickets/${legacy}`)?.projectName, before!.projectName);
  assert.equal(db.records.get(`tickets/${legacy}`)?.completedAt, before!.completedAt);
  const publicTicket = await service.detail(legacy, company);
  assert.equal(publicTicket.title, 'Change hours');
  assert.equal(publicTicket.ticket_number, values[0]?.ticketNumber);
  assert.equal(publicTicket.completed_at, '2026-10-24T14:00:00.000Z');
});

test('completion dates follow finished/reopened transitions and stay independent from billing and conversation changes', async () => {
  const { ticketCompletionPatch } = await import('../lib/ticketIdentity');
  const at='2026-11-12T20:00:00Z', original='2026-10-24T14:00:00Z';
  const current={workspace:'Support Tickets', status:'In Progress'};
  assert.deepEqual(ticketCompletionPatch(current,'Needs Invoiced',at),{completedAt:at});
  assert.deepEqual(ticketCompletionPatch({...current,status:'Needs Invoiced',completedAt:original},'Done',at),{});
  assert.deepEqual(ticketCompletionPatch({...current,status:'Done',completedAt:original},'In Progress',at),{completedAt:null});
  assert.deepEqual(ticketCompletionPatch({...current,status:'Done'},undefined,at),{});
  assert.deepEqual(ticketCompletionPatch({...current,workspace:'SEO'},'Done',at),{});
  assert.deepEqual(ticketCompletionPatch({...current,parentId:'parent'},'Done',at),{});
});

test('legacy reference fill is staff-only, bounded and idempotent', async () => {
  const api = handlers();
  const references = await api.staffReferences(new NextRequest('https://crm.example/api/support/tickets/references', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[ticketId,ticketId]})}));
  assert.equal(references.status,200);
  const result=await references.json();
  assert.equal(result.references.length,1);
  assert.match(result.references[0].ticket_number,/^AW-\d{6}$/);
  const rejected=createSupportHandlers(()=>db as never,async()=>{throw new (await import('../lib/supportService')).SupportError(403,'Support ticket access is required.');});
  assert.equal((await rejected.staffReferences(new NextRequest('https://crm.example/api/support/tickets/references',{method:'POST'}))).status,403);
  assert.equal((await api.staffReferences(new NextRequest('https://crm.example/api/support/tickets/references',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:Array(101).fill(ticketId)})}))).status,400);
});
