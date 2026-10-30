import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import { getPortalListingsFirestore } from "./portalListingsDb";
import {
  fingerprint,
  supportEmail,
  supportTeamAccess,
  verifyReplyAddress,
  verifySupportMailgun,
} from "./supportPolicy";
import {
  SupportError,
  SupportService,
  validateSupportFiles,
} from "./supportService";
import { supportJson } from "./supportHandlers";

export async function supportInbound(input: {
  sender: string;
  recipient: string;
  body: string;
  timestamp: string;
  token: string;
  signature: string;
  formData: FormData | null;
}) {
  try {
    const sender = supportEmail(input.sender),
      recipient = supportEmail(input.recipient);
    if (
      !sender ||
      !recipient ||
      !verifySupportMailgun(
        input.timestamp,
        input.token,
        input.signature,
        process.env.MAILGUN_SIGNING_KEY,
      )
    )
      return supportJson({ error: "Invalid message signature." }, 401);
    const directTicket = verifyReplyAddress(
      recipient,
      sender,
      process.env.MAILGUN_DOMAIN || "",
      process.env.MAILGUN_SIGNING_KEY || "",
    );
    const teamTicket = verifyReplyAddress(
      recipient,
      "support-team@awebco.com",
      process.env.MAILGUN_DOMAIN || "",
      process.env.MAILGUN_SIGNING_KEY || "",
    );
    const ticketId = directTicket || teamTicket;
    if (!ticketId)
      return supportJson({ error: "Reply address is invalid." }, 403);
    const service = new SupportService(getPortalListingsFirestore());
    const ticket = await service.ticket(ticketId);
    const team = await service.db.collection("users").limit(101).get();
    if (team.size > 100) throw new SupportError(503, "Support is unavailable.");
    const member = team.docs.find(
      (doc) =>
        supportEmail(doc.data().email) === sender &&
        supportTeamAccess(doc.data()),
    );
    const clients = [
      ticket.email,
      ...(Array.isArray(ticket.supportParticipants)
        ? ticket.supportParticipants
        : []),
    ].map(supportEmail);
    if ((!directTicket && !member) || (!member && !clients.includes(sender)))
      return supportJson(
        { error: "Sender is not part of this conversation." },
        403,
      );
    if (member) {
      try {
        if (
          (
            await getAuth(getApp()).getUser(
              typeof member.data().authUid === "string"
                ? member.data().authUid
                : member.id,
            )
          ).disabled
        )
          throw new Error("disabled");
      } catch {
        return supportJson(
          { error: "Sender no longer has support access." },
          403,
        );
      }
    }
    const form = input.formData;
    if (!form)
      return supportJson({ error: "A signed email post is required." }, 400);
    const headers: unknown = JSON.parse(
      String(form.get("message-headers") || "[]"),
    );
    const pairs = Array.isArray(headers) ? headers : [];
    const messageId = String(
      form.get("Message-Id") ||
        form.get("message-id") ||
        pairs.find(
          (pair) =>
            Array.isArray(pair) &&
            String(pair[0]).toLowerCase() === "message-id",
        )?.[1] ||
        "",
    );
    if (!messageId || messageId.length > 1000)
      return supportJson({ error: "Message ID is required." }, 400);
    // Automatic replies must never trigger another notification and create a mail loop.
    const header = (name: string) =>
      String(
        pairs.find(
          (pair) =>
            Array.isArray(pair) && String(pair[0]).toLowerCase() === name,
        )?.[1] || "",
      ).toLowerCase();
    if (
      (header("auto-submitted") && header("auto-submitted") !== "no") ||
      /bulk|junk|list/.test(header("precedence"))
    )
      return supportJson({ ignored: true });
    const body = form.has("stripped-text")
      ? String(form.get("stripped-text") || "")
      : input.body;
    if (body.length > 10000)
      return supportJson({ error: "Reply is too long." }, 400);
    const files = [...form.entries()]
      .filter(
        ([key, value]) =>
          /^attachment-\d+$/.test(key) && typeof value !== "string",
      )
      .map(([, value]) => value as File);
    validateSupportFiles(files);
    if (!body.trim() && !files.length) return supportJson({ ignored: true });
    const actor = {
      name: member
        ? String(member.data().name || "Awebco")
        : sender === supportEmail(ticket.email)
          ? String(ticket.contactName || "Client")
          : sender,
      email: sender,
      direction: member ? ("team" as const) : ("client" as const),
    };
    await service.reply(
      ticketId,
      `email-${fingerprint([ticketId, messageId]).slice(0, 40)}`,
      body,
      actor,
      files,
    );
    return supportJson({ success: true });
  } catch (error) {
    if (error instanceof SupportError)
      return supportJson({ error: error.message }, error.status);
    console.error("[support] Inbound message could not be processed.");
    return supportJson({ error: "Message could not be processed." }, 503);
  }
}
