import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { publicSupportReplyRoute, upsertPublicSupport } from "./supportPublic";
import { SupportError } from "./supportService";
import { supportCategories, supportPriorities } from "./supportPolicy";
import { supportJson } from "./supportHandlers";

const submission = z.object({
  subject: z.string().max(500),
  body: z.string().trim().min(1).max(100000),
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(500),
  category: z.string().transform((v) => v.replace(/^Category:\s*/i, "").trim()).pipe(z.enum(supportCategories)),
  priority: z.string().transform((v) => v.replace(/^Priority:\s*/i, "").trim()).pipe(z.enum(supportPriorities)),
  form_id: z.union([z.literal(80), z.literal("80")]).optional(),
  entry_id: z.union([z.string().regex(/^\d{1,12}$/), z.number().int().positive().max(999999999999)]).optional(),
  uploads: z.union([z.string().max(32000), z.array(z.string().max(4000)).max(100)]).nullable().optional(),
  support_route: z.boolean().optional(),
  notification_to: z.union([z.string().max(4000), z.array(z.string().max(254)).max(100)]).optional(),
});

export function publicSupportSubmission(payload: unknown) {
  const parsed = submission.safeParse(payload);
  if (!parsed.success) throw new SupportError(400, "A valid support form submission is required.");
  const data = parsed.data;
  const entryId = /^Ticket #(\d{1,12}) - \S/i.exec(data.subject)?.[1];
  // Feed 28 predates explicit metadata. Keep its verified field mapping working;
  // whenever the connector supplies metadata, require both IDs to agree.
  if (!entryId || ((data.form_id !== undefined || data.entry_id !== undefined) &&
      (data.form_id === undefined || String(data.entry_id) !== entryId)))
    throw new SupportError(400, "A valid support form submission is required.");
  return { ...data, entryId };
}

type FileLink = { id: string; name: string; url: string; uploadedAt: string };
export function createPublicSupportWebhook(
  extractFiles: (payload: unknown) => FileLink[],
  upsert = upsertPublicSupport,
  replyRoute = publicSupportReplyRoute,
) {
  return async (request: Request) => {
    try {
      const expected = process.env.WEBHOOK_SECRET;
      const actual = new URL(request.url).searchParams.get("secret") || request.headers.get("x-webhook-secret") || "";
      if (!expected || expected.length < 16 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
        return supportJson({ error: "Unauthorized" }, 401);
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        return supportJson({ error: "A JSON form submission is required." }, 415);
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = request.body?.getReader();
      if (!reader) throw new SupportError(400, "Request is empty.");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 512000) {
          await reader.cancel();
          throw new SupportError(413, "Request is too large.");
        }
        chunks.push(value);
      }
      const data = publicSupportSubmission(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const files = extractFiles(data);
      // Preserve GF's uploaded-file field, including links without an extension.
      const uploads = Array.isArray(data.uploads) ? data.uploads : (data.uploads || "").split(/[\n,]+/);
      for (const raw of uploads) {
        try {
          const url = new URL(raw.trim());
          if (!["https:", "http:"].includes(url.protocol) || files.some((file) => file.url === url.href)) continue;
          const path = url.searchParams.get("gf-download") || url.pathname;
          files.push({ id: `upload-${files.length}`, name: decodeURIComponent(path.split("/").at(-1) || "attachment"), url: url.href, uploadedAt: new Date().toISOString() });
        } catch { /* Ignore invalid attachment links. */ }
      }
      const ticketId = await upsert({ entryId: data.entryId, subject: data.subject, description: data.body, email: data.email, contactName: data.name, companyName: data.company, category: data.category, priority: data.priority, files });
      const routing = data.support_route ? await replyRoute(ticketId, data.notification_to) : null;
      return supportJson({ success: true, ticketId, ...(routing ? { routing } : {}) });
    } catch (error) {
      if (error instanceof SupportError) return supportJson({ success: false, error: error.message }, error.status);
      if (error instanceof SyntaxError) return supportJson({ success: false, error: "Invalid JSON." }, 400);
      // Never include a payload, credential, signed reply address or DB error.
      console.error("[support] Public form intake could not be processed.");
      return supportJson({ success: false, error: "Support intake is unavailable." }, 503);
    }
  };
}
