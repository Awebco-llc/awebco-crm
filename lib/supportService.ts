import {
  supportMessagePresentation,
  supportNotification,
} from "./supportEmail";
import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import {
  FieldPath,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import { getStorageAdmin } from "./firebaseAdmin";
import {
  allowedSupportFile,
  fingerprint,
  legacySupportFiles,
  replyAddress,
  shareSupportTicket,
  supportEmail,
  supportEmailAllowed,
  supportId,
  supportStatus,
  SUPPORT_FILE_BYTES,
  ticketRequestId,
  type SupportAttachment,
  type SupportMessage,
  type supportCreateInput,
} from "./supportPolicy";
import type { z } from "zod";

export class SupportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type RecordData = Record<string, unknown>;
type Actor = { name: string; email: string; direction: "client" | "team" };
type CreateInput = z.infer<typeof supportCreateInput>;
const date = (value: unknown) => {
  const input = value as { toDate?: () => Date };
  const parsed =
    input?.toDate?.() ?? new Date(typeof value === "string" ? value : NaN);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
export const ticketFields = [
  "workspace",
  "parentId",
  "companyId",
  "projectName",
  "status",
  "createdAt",
  "updatedAt",
  "isManual",
  "supportVisibility",
];

export function publicSupportTicket(
  id: string,
  data: RecordData,
  detail = false,
) {
  return {
    id,
    title: String(data.projectName || "Support request").slice(0, 500),
    description: detail ? String(data.description || "").slice(0, 20000) : "",
    status: supportStatus(data.status),
    created_at: date(data.createdAt),
    updated_at: date(data.updatedAt),
    ...(detail
      ? {
          category: String(data.category || "").replace(/^Category:\s*/i, ""),
          priority: String(data.priority || ""),
          attachments: legacySupportFiles(data.files),
        }
      : {}),
  };
}
function publicMessage(id: string, data: RecordData): SupportMessage | null {
  if (
    data.visibility !== "client" ||
    !["client", "team"].includes(String(data.direction))
  )
    return null;
  const presentation = supportMessagePresentation(id, data);
  const file = (attachment: SupportAttachment) => ({
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
  });
  return {
    id,
    author: String(data.author || "Awebco").slice(0, 200),
    text: presentation.text.slice(0, 10000),
    created_at: String(data.created_at),
    direction: data.direction as "client" | "team",
    ...(data.kind === "request" ? { kind: "request" as const } : {}),
    ...(presentation.signature
      ? { email_signature: presentation.signature }
      : {}),
    ...(presentation.inline.length
      ? { inline_attachments: presentation.inline.map(file) }
      : {}),
    attachments: presentation.attachments.map(file),
  };
}
export function validateSupportFiles(files: File[], maxFiles: 5 | 20 = 5) {
  if (
    files.length > maxFiles ||
    files.reduce((sum, f) => sum + f.size, 0) > SUPPORT_FILE_BYTES
  )
    throw new SupportError(
      400,
      `Attach up to ${maxFiles} files, with a maximum total size of 3 MB.`,
    );
  if (
    files.some(
      (f) =>
        !f.size || f.name.length > 200 || !allowedSupportFile(f.name, f.type),
    )
  )
    throw new SupportError(
      400,
      "Use an image, PDF, Office document, ZIP, CSV, or text file.",
    );
}

type SupportMember = { id: string; data: RecordData };
async function activeSupportRecipients(members: SupportMember[]) {
  if (!members.length) return [];
  const uid = (member: SupportMember) =>
    typeof member.data.authUid === "string" ? member.data.authUid : member.id;
  const accounts = await getAuth(getApp()).getUsers(
    members.map((member) => ({ uid: uid(member) })),
  );
  return members.filter((member) =>
    accounts.users.some(
      (user) =>
        user.uid === uid(member) &&
        !user.disabled &&
        supportEmail(user.email) === supportEmail(member.data.email),
    ),
  );
}
export class SupportService {
  constructor(
    readonly db: Firestore,
    private activeRecipients = activeSupportRecipients,
    private storage = getStorageAdmin,
  ) {}
  async companies() {
    const result = await this.db
      .collection("companies")
      .select("name", "domain")
      .orderBy(FieldPath.documentId())
      .limit(501)
      .get();
    if (result.size > 500)
      throw new SupportError(
        503,
        "Company list is unavailable. Contact your administrator.",
      );
    return result.docs.map((doc) => ({
      id: doc.id,
      name: String(doc.data().name || "Company"),
      domain: String(doc.data().domain || ""),
    }));
  }
  async company(id: string) {
    if (!supportId(id)) throw new SupportError(404, "Company not found.");
    const doc = await this.db.collection("companies").doc(id).get();
    if (!doc.exists) throw new SupportError(404, "Company not found.");
    return doc.data()!;
  }
  async ticket(ticketId: string, companyId?: string, shared = true) {
    if (!supportId(ticketId)) throw new SupportError(404, "Ticket not found.");
    const doc = await this.db.collection("tickets").doc(ticketId).get();
    const data = doc.data();
    if (
      !data ||
      data.workspace !== "Support Tickets" ||
      data.parentId ||
      (companyId && data.companyId !== companyId) ||
      (shared && !shareSupportTicket(data, companyId))
    )
      throw new SupportError(404, "Ticket not found.");
    return data;
  }
  async list(companyId: string) {
    await this.company(companyId);
    const result = await this.db
      .collection("tickets")
      .where("companyId", "==", companyId)
      .where("workspace", "==", "Support Tickets")
      .select(...ticketFields)
      .limit(501)
      .get();
    if (result.size > 500)
      throw new SupportError(
        503,
        "Ticket history is unavailable. Contact Awebco.",
      );
    return result.docs
      .filter((doc) => shareSupportTicket(doc.data(), companyId))
      .map((doc) => publicSupportTicket(doc.id, doc.data()))
      .sort(
        (a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "") ||
          a.id.localeCompare(b.id),
      );
  }
  async detail(ticketId: string, companyId?: string, staff = false) {
    if (companyId) await this.company(companyId);
    const ticket = await this.ticket(ticketId, companyId, !staff);
    const messages = await this.db
      .collection("tickets")
      .doc(ticketId)
      .collection("messages")
      .orderBy("created_at")
      .limit(501)
      .get();
    if (messages.size > 500)
      throw new SupportError(
        503,
        "Conversation is unavailable. Contact Awebco.",
      );
    const publicMessages = messages.docs.flatMap((doc) => {
      const message = publicMessage(doc.id, doc.data());
      return message
        ? [
            {
              ...message,
              ...(staff
                ? { email_status: doc.data().email_status || "pending" }
                : {}),
            },
          ]
        : [];
    });
    return {
      ...publicSupportTicket(ticketId, ticket, true),
      messages: publicMessages,
      ...(staff
        ? {
            shared: shareSupportTicket(ticket),
            requester: supportEmail(ticket.email),
            company_linked: !!ticket.companyId,
          }
        : {}),
    };
  }
  async prepareFiles(
    ticketId: string,
    messageId: string,
    files: File[],
    maxFiles: 5 | 20 = 5,
  ) {
    validateSupportFiles(files, maxFiles);
    const result: SupportAttachment[] = [];
    for (const [index, file] of files.entries()) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const fileId = `${index}-${fingerprint([file.name, bytes.toString("base64")]).slice(0, 16)}`;
      result.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        path: `support/${ticketId}/${messageId}/${fileId}`,
      });
    }
    return result;
  }
  async uploadFiles(attachments: SupportAttachment[], files: File[]) {
    if (!files.length) return;
    const bucket = this.storage();
    for (const [index, file] of files.entries()) {
      // Deterministic names and create-only writes make retries safe.
      try {
        await bucket
          .file(attachments[index].path!)
          .save(Buffer.from(await file.arrayBuffer()), {
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
              contentType: attachments[index].type,
              cacheControl: "private, no-store",
            },
          });
      } catch (error) {
        if ((error as { code?: number }).code !== 412) throw error;
      }
    }
  }
  async create(companyId: string, input: CreateInput, files: File[]) {
    const company = await this.company(companyId);
    const ticketId = ticketRequestId(companyId, input.request_id);
    const attachments = await this.prepareFiles(
      ticketId,
      input.request_id,
      files,
    );
    const hash = fingerprint([input, attachments]);
    const ticketRef = this.db.collection("tickets").doc(ticketId);
    const existing = await ticketRef.get();
    if (
      existing.exists &&
      (existing.data()?.supportRequestHash !== hash ||
        existing.data()?.companyId !== companyId)
    )
      throw new SupportError(
        409,
        "This request changed. Reload and submit it again.",
      );
    await this.uploadFiles(attachments, files);
    const at = new Date().toISOString();
    await this.db.runTransaction(async (tx) => {
      const current = await tx.get(ticketRef);
      if (current.exists) {
        if (
          current.data()?.supportRequestHash !== hash ||
          !shareSupportTicket(current.data()!, companyId)
        )
          throw new SupportError(
            409,
            "This request changed. Reload and submit it again.",
          );
        return;
      }
      tx.create(ticketRef, {
        workspace: "Support Tickets",
        groupId: "group-active",
        companyId,
        companyName: String(company.name || ""),
        projectName: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        email: input.email,
        contactName: input.name,
        status: "Not Started",
        isManual: false,
        supportVisibility: "client",
        createdAt: at,
        updatedAt: at,
        order: Date.now(),
        assignee: "",
        assignees: [],
        assignedToId: "",
        notes: "",
        supportRequestHash: hash,
        supportParticipants: [input.email],
        supportPortalOrigin: input.portal_origin,
        supportPortalClientId: input.portal_client_id,
      });
      tx.create(ticketRef.collection("messages").doc(input.request_id), {
        visibility: "client",
        direction: "client",
        kind: "request",
        author: input.name,
        sender_email: input.email,
        text: input.description,
        created_at: at,
        attachments,
        request_hash: hash,
        email_status: "pending",
      });
    });
    await this.notify(ticketId, input.request_id);
    return this.detail(ticketId, companyId);
  }
  async reply(
    ticketId: string,
    requestId: string,
    text: string,
    actor: Actor,
    files: File[],
    companyId?: string,
    email?: { messageId: string; inlineFiles: number[]; senderName?: string },
  ) {
    if (!supportId(requestId)) throw new SupportError(400, "Invalid reply.");
    if (companyId) await this.company(companyId);
    await this.ticket(ticketId, companyId);
    if (!text.trim() && !files.length)
      throw new SupportError(400, "Write a reply or attach a file.");
    const attachments = await this.prepareFiles(
      ticketId,
      requestId,
      files,
      email ? 20 : 5,
    );
    const hash = fingerprint([text, actor, attachments]);
    const ticketRef = this.db.collection("tickets").doc(ticketId),
      messageRef = ticketRef.collection("messages").doc(requestId);
    const existing = await messageRef.get();
    if (existing.exists && existing.data()?.request_hash !== hash)
      throw new SupportError(
        409,
        "This reply changed. Reload the conversation and try again.",
      );
    await this.uploadFiles(attachments, files);
    await this.db.runTransaction(async (tx) => {
      const ticket = await tx.get(ticketRef),
        message = await tx.get(messageRef);
      if (!ticket.exists || !shareSupportTicket(ticket.data()!, companyId))
        throw new SupportError(404, "Ticket not found.");
      if (message.exists) {
        if (message.data()?.request_hash !== hash)
          throw new SupportError(
            409,
            "This reply changed. Reload the conversation and try again.",
          );
        return;
      }
      const at = new Date().toISOString();
      tx.create(messageRef, {
        visibility: "client",
        direction: actor.direction,
        author: actor.name,
        sender_email: actor.email,
        text: text.trim(),
        ...(email
          ? {
              email_message_id: email.messageId,
              email_sender_name: email.senderName || actor.name,
              inline_attachment_ids: email.inlineFiles
                .map((index) => attachments[index]?.id)
                .filter(Boolean),
            }
          : {}),
        created_at: at,
        attachments,
        request_hash: hash,
        email_status: "pending",
      });
      // Conversation timestamps are separate from the billing/completion date and task status.
      tx.update(ticketRef, {
        supportLastMessageAt: at,
        ...(email ? { supportLastEmailMessageId: email.messageId } : {}),
        ...(actor.direction === "client"
          ? { supportParticipants: FieldValue.arrayUnion(actor.email) }
          : {}),
      });
    });
    await this.notify(ticketId, requestId);
    return this.detail(ticketId, companyId, actor.direction === "team");
  }
  async teamRecipients(ticket: RecordData) {
    const snapshot = await this.db.collection("users").limit(101).get();
    if (snapshot.size > 100)
      throw new SupportError(503, "Support notifications are unavailable.");
    const users = snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter(
        ({ data }) =>
          (data.role === "master_admin" ||
            data.role === "admin" ||
            (["staff", "freelancer"].includes(String(data.role)) &&
              data.permissions?.allowedWorkspaces?.includes(
                "Support Tickets",
              ))) &&
          supportEmail(data.email),
      );
    const assigned = new Set([
      ticket.assignee,
      ticket.assignedToId,
      ...(Array.isArray(ticket.assignees) ? ticket.assignees : []),
    ]);
    const selected = users.filter((user) => assigned.has(user.id));
    // Unassigned tickets notify support-board staff; admins remain the fallback.
    const recipients = selected.length
      ? selected
      : users.filter(
          ({ data }) =>
            data.permissions?.allowedWorkspaces?.includes("Support Tickets") ||
            data.role === "master_admin" ||
            data.role === "admin",
        );
    let active = await this.activeRecipients(recipients);
    if (!active.length && selected.length)
      active = await this.activeRecipients(
        users.filter(
          ({ data }) => data.role === "admin" || data.role === "master_admin",
        ),
      );
    return [...new Set(active.map(({ data }) => supportEmail(data.email)!))];
  }
  async notify(ticketId: string, messageId: string) {
    const ticketRef = this.db.collection("tickets").doc(ticketId),
      messageRef = ticketRef.collection("messages").doc(messageId);
    try {
      const ticket = await this.ticket(ticketId);
      const message = (await messageRef.get()).data()!;
      const clients = [
        ...new Set(
          [
            supportEmail(ticket.email),
            ...(Array.isArray(ticket.supportParticipants)
              ? ticket.supportParticipants.map(supportEmail)
              : []),
          ].filter((email): email is string => !!email),
        ),
      ];
      const team =
        message.direction === "client" ? await this.teamRecipients(ticket) : [];
      const recipients = [
        ...new Map([
          ...team.map((email) => [email, "team"] as const),
          ...(message.direction === "team" || message.kind === "request"
            ? clients
            : []
          ).map((email) => [email, "client"] as const),
        ]).entries(),
      ].filter(
        ([email]) =>
          supportEmailAllowed(email) &&
          (message.kind === "request" ||
            (message.direction === "team" && !messageId.startsWith("email-")) ||
            email !== message.sender_email),
      );
      if (!recipients.length) {
        await messageRef.update({ email_status: "not_required" });
        return;
      }
      for (const [email, audience] of recipients) {
        const ref = messageRef
          .collection("notifications")
          .doc(fingerprint(email).slice(0, 32));
        const claimed = await this.db.runTransaction(async (tx) => {
          const state = (await tx.get(ref)).data();
          if (state && !["failed", "pending"].includes(state.status))
            return false;
          tx.set(ref, {
            status: "sending",
            started_at: new Date().toISOString(),
          });
          return true;
        });
        if (!claimed) continue;
        let status: string = "uncertain";
        try {
          status = await this.sendEmail(
            ticketId,
            ticket,
            messageId,
            message,
            email,
            audience,
          );
        } catch {
          console.error("[support] Email notification was not confirmed.");
        }
        await ref.update({ status });
      }
      const states = (
        await messageRef.collection("notifications").get()
      ).docs.map((doc) => doc.data().status);
      await messageRef.update({
        email_status: states.every((s) => s === "accepted")
          ? "accepted"
          : states.some((s) => s === "uncertain" || s === "sending")
            ? "uncertain"
            : "failed",
      });
    } catch {
      console.error("[support] Notification could not be completed.");
      await messageRef.update({ email_status: "failed" }).catch(() => {});
    }
  }
  async sendEmail(
    ticketId: string,
    ticket: RecordData,
    messageId: string,
    message: RecordData,
    email: string,
    audience: "client" | "team",
  ) {
    if (!supportEmailAllowed(email)) return "failed";
    const domain = process.env.MAILGUN_DOMAIN,
      sendingDomain = (process.env.SUPPORT_SENDING_DOMAIN || domain || "")
        .trim()
        .toLowerCase(),
      key = process.env.MAILGUN_API_KEY,
      routingKey = process.env.MAILGUN_SIGNING_KEY;
    if (
      !domain ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(
        sendingDomain,
      ) ||
      !key ||
      key.startsWith("your-") ||
      !routingKey ||
      routingKey.length < 32
    )
      return "failed";
    const host = process.env.MAILGUN_HOST || "api.mailgun.net";
    if (!["api.mailgun.net", "api.eu.mailgun.net"].includes(host))
      return "failed";
    const replyTo = replyAddress(ticketId, email, domain, routingKey);
    const link =
      audience === "team"
        ? `https://awebco-crm.vercel.app/?nav=Support%20Tickets&ticket=${encodeURIComponent(ticketId)}&conversation=client`
        : `${process.env.VERCEL_ENV === "preview" ? "https://staging-portal.awebco.com" : "https://portal.awebco.com"}/support?ticket=${encodeURIComponent(ticketId)}`;
    const presentation = supportMessagePresentation(messageId, message);
    const content = supportNotification({
      title: String(ticket.projectName),
      author: String(message.author),
      text: presentation.text,
      link,
      audience,
      received: message.kind === "request" && audience === "client",
      attachments: presentation.attachments.map((file) => file.name),
    });
    const form = new FormData();
    form.set(
      "from",
      process.env.MAILGUN_FROM_EMAIL ||
        `Awebco Support <support@${sendingDomain}>`,
    );
    form.set("to", email);
    form.set(
      "subject",
      `${message.kind === "request" && audience === "client" ? "Request received: " : "Re: "}${String(
        ticket.projectName,
      )
        .replace(/[\r\n]/g, " ")
        .slice(0, 150)}`,
    );
    form.set("text", content.text);
    form.set("html", content.html);
    form.set("h:Reply-To", replyTo);
    form.set(
      "h:Message-ID",
      `<support-${ticketId}-${messageId}-${fingerprint(email).slice(0, 12)}@${sendingDomain}>`,
    );
    const parent = ticket.supportLastEmailMessageId;
    if (
      typeof parent === "string" &&
      parent.length <= 1000 &&
      !/[\r\n]/.test(parent) &&
      /^<?[^<>\s]+@[^<>\s]+>?$/.test(parent)
    ) {
      const messageIdHeader = `<${parent.replace(/^<|>$/g, "")}>`;
      form.set("h:In-Reply-To", messageIdHeader);
      form.set("h:References", messageIdHeader);
    }
    form.set("o:tag", "portal-support");
    for (const attachment of presentation.attachments) {
      if (!attachment.path?.startsWith(`support/${ticketId}/${messageId}/`))
        continue;
      const [bytes] = await this.storage().file(attachment.path).download();
      form.append(
        "attachment",
        new Blob([new Uint8Array(bytes)], { type: attachment.type }),
        attachment.name,
      );
    }
    const response = await fetch(
      `https://${host}/v3/${sendingDomain}/messages`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}`,
        },
        body: form,
        signal: AbortSignal.timeout(20000),
      },
    );
    // Only definitive provider rejection can be retried automatically. A timeout/5xx is ambiguous.
    return response.ok
      ? "accepted"
      : response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408
        ? "failed"
        : "uncertain";
  }
  async download(
    ticketId: string,
    messageId: string,
    fileId: string,
    companyId?: string,
    staff = false,
  ) {
    await this.ticket(ticketId, companyId, !staff);
    if (!supportId(messageId) || !supportId(fileId))
      throw new SupportError(404, "File not found.");
    const message = (
      await this.db
        .collection("tickets")
        .doc(ticketId)
        .collection("messages")
        .doc(messageId)
        .get()
    ).data();
    if (message?.visibility !== "client")
      throw new SupportError(404, "File not found.");
    const file = (message.attachments as SupportAttachment[] | undefined)?.find(
      (f) => f.id === fileId,
    );
    if (!file?.path?.startsWith(`support/${ticketId}/${messageId}/`))
      throw new SupportError(404, "File not found.");
    const [bytes] = await this.storage().file(file.path).download();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
