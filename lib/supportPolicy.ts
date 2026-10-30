import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const supportCategories = [
  "Technical Support",
  "Website Updates",
  "General Questions",
  "Other",
] as const;
export const supportPriorities = ["Low", "Medium", "High", "Urgent"] as const;
export const SUPPORT_FILE_BYTES = 3_000_000;
export const SUPPORT_BODY_BYTES = SUPPORT_FILE_BYTES + 64_000;
export const supportReplyInput = z
  .object({
    request_id: z.string().uuid(),
    text: z.string().trim().max(10000),
  })
  .strict();
export const supportCreateInput = z
  .object({
    request_id: z.string().uuid(),
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(5000),
    category: z.enum(supportCategories),
    priority: z.enum(supportPriorities),
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(1).max(200),
    portal_client_id: z.string().min(1).max(128),
    portal_origin: z.enum([
      "https://portal.awebco.com",
      "https://staging-portal.awebco.com",
    ]),
  })
  .strict();
export type SupportAttachment = {
  id: string;
  name: string;
  size?: number;
  type?: string;
  path?: string;
  url?: string;
};
export type SupportMessage = {
  id: string;
  author: string;
  text: string;
  created_at: string;
  direction: "client" | "team";
  kind?: "request";
  attachments: SupportAttachment[];
};
export function supportId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function supportEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = (value.match(/<([^<>]+)>/)?.[1] ?? value)
    .trim()
    .toLowerCase();
  return z.string().email().max(254).safeParse(candidate).success
    ? candidate
    : null;
}
export function supportStatus(value: unknown) {
  if (["Needs Invoiced", "Done", "Closed"].includes(String(value)))
    return "Completed";
  if (value === "Not Started") return "Open";
  if (value === "In Progress") return "In progress";
  if (value === "Awaiting Customer") return "Awaiting your reply";
  if (value === "On Hold") return "On hold";
  return "Status unavailable";
}
export function shareSupportTicket(
  ticket: Record<string, unknown>,
  companyId?: string,
) {
  return (
    ticket.workspace === "Support Tickets" &&
    !ticket.parentId &&
    (!companyId || ticket.companyId === companyId) &&
    (ticket.supportVisibility === "client" ||
      (ticket.supportVisibility !== "internal" && ticket.isManual === false))
  );
}
export function supportTeamAccess(
  profile: Record<string, unknown> | undefined,
) {
  if (!profile) return false;
  if (profile.role === "master_admin" || profile.role === "admin") return true;
  const permissions = profile.permissions as
    { allowedWorkspaces?: string[] } | undefined;
  return (
    ["staff", "freelancer"].includes(String(profile.role)) &&
    !!permissions?.allowedWorkspaces?.includes("Support Tickets")
  );
}
export function replyAddress(
  ticketId: string,
  recipient: string,
  domain: string,
  key: string,
) {
  if (
    !supportId(ticketId) ||
    !supportEmail(recipient) ||
    !/^[a-z0-9.-]+$/i.test(domain) ||
    key.length < 32
  )
    throw new Error("Email routing is unavailable.");
  const token = createHmac("sha256", key)
    .update(`support-reply:v1:${ticketId}:${recipient.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
  const local = `inbound+st.${ticketId}.${token}`;
  if (local.length > 64)
    throw new Error("Ticket email routing is unavailable.");
  return `${local}@${domain}`;
}
export function verifyReplyAddress(
  recipient: string,
  sender: string,
  domain: string,
  key: string,
) {
  const match =
    /^inbound\+st\.([A-Za-z0-9_-]+)\.([a-f0-9]{24})@([a-z0-9.-]+)$/i.exec(
      recipient,
    );
  if (!match || match[3].toLowerCase() !== domain.toLowerCase()) return null;
  try {
    const expected = replyAddress(match[1], sender, domain, key).toLowerCase();
    const actual = recipient.toLowerCase();
    return expected.length === actual.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
      ? match[1]
      : null;
  } catch {
    return null;
  }
}
export function verifySupportMailgun(
  timestamp: string,
  token: string,
  signature: string,
  key: string | undefined,
  at = Date.now(),
) {
  if (
    !key ||
    key.startsWith("your-") ||
    !/^\d{10}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !token ||
    token.length > 256
  )
    return false;
  // Mailgun can retry receiving posts for hours. The message ID is deduplicated separately.
  if (Math.abs(at / 1000 - Number(timestamp)) > 24 * 60 * 60) return false;
  const expected = createHmac("sha256", key)
    .update(timestamp + token)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function ticketRequestId(company: string, request: string) {
  return fingerprint([company, request]).slice(0, 24);
}
export function allowedSupportFile(name: string, type: string) {
  return (
    /\.(png|jpe?g|gif|webp|pdf|txt|csv|docx?|xlsx?|pptx?|zip)$/i.test(name) &&
    !["text/html", "image/svg+xml", "application/javascript"].includes(type)
  );
}
export function legacySupportFiles(value: unknown): SupportAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((file, index) => {
    if (!file || typeof file.name !== "string" || typeof file.url !== "string")
      return [];
    try {
      const url = new URL(file.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        ![
          "awebco.com",
          "www.awebco.com",
          "firebasestorage.googleapis.com",
          "storage.googleapis.com",
        ].includes(url.hostname)
      )
        return [];
      return [
        {
          id: String(index),
          name: file.name.slice(0, 200),
          url: url.toString(),
        },
      ];
    } catch {
      return [];
    }
  });
}

// Preview deployments share CRM data, so support email is limited to an agreed test inbox.
export function supportEmailAllowed(
  email: string,
  environment = process.env.VERCEL_ENV,
  recipient = process.env.PORTAL_SUPPORT_PREVIEW_RECIPIENT,
) {
  return (
    environment !== "preview" ||
    (!!supportEmail(recipient) &&
      supportEmail(email) === supportEmail(recipient))
  );
}
