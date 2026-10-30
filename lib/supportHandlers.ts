import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPortalListingsFirestore } from "./portalListingsDb";
import { checkListingsAuth } from "./portalListings";
import { SupportError, SupportService } from "./supportService";
import {
  SUPPORT_BODY_BYTES,
  supportCreateInput,
  supportEmail,
  supportId,
  supportReplyInput,
  supportTeamAccess,
} from "./supportPolicy";

type Context = {
  params: Promise<{
    resourceId?: string;
    ticketId?: string;
    messageId?: string;
    fileId?: string;
  }>;
};
export function supportJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function supportBody(request: Request) {
  if (Number(request.headers.get("content-length")) > SUPPORT_BODY_BYTES)
    throw new SupportError(
      413,
      "Files are too large. Use up to 3 MB in total.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new SupportError(400, "Request is empty.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SUPPORT_BODY_BYTES) {
      await reader.cancel();
      throw new SupportError(
        413,
        "Files are too large. Use up to 3 MB in total.",
      );
    }
    chunks.push(value);
  }
  const copy = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await copy.formData();
    const payload = form.get("payload");
    if (
      typeof payload !== "string" ||
      payload.length > 32000 ||
      [...form.keys()].some((key) => !["payload", "files"].includes(key))
    )
      throw new SupportError(400, "Invalid request.");
    const files = form.getAll("files");
    if (files.some((file) => typeof file === "string"))
      throw new SupportError(400, "Invalid attachment.");
    return { payload: JSON.parse(payload) as unknown, files: files as File[] };
  }
  if (size > 32000) throw new SupportError(413, "Request is too large.");
  return { payload: (await copy.json()) as unknown, files: [] as File[] };
}
export async function supportStaff(request: Request, service: SupportService) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new SupportError(403, "Request is not allowed.");
  const token = /^Bearer (\S+)$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token || token.length > 8000)
    throw new SupportError(401, "Sign in to the CRM.");
  let uid: string;
  try {
    uid = (await getAuth(getApp()).verifyIdToken(token, true)).uid;
  } catch {
    throw new SupportError(401, "Sign in to the CRM again.");
  }
  const profile = (await service.db.collection("users").doc(uid).get()).data();
  const email = supportEmail(profile?.email);
  if (!supportTeamAccess(profile) || !email)
    throw new SupportError(403, "Support ticket access is required.");
  return {
    name: String(profile!.name || "Awebco"),
    email,
    direction: "team" as const,
  };
}
export function createSupportHandlers(
  resolveDb = getPortalListingsFirestore,
  staff = supportStaff,
) {
  function route(
    audience: "portal" | "staff",
    operation: (
      request: NextRequest,
      service: SupportService,
      params: Awaited<Context["params"]>,
      actor?: Awaited<ReturnType<typeof staff>>,
    ) => Promise<unknown>,
  ) {
    return async (request: NextRequest, context?: Context) => {
      try {
        if (audience === "portal") {
          const auth = checkListingsAuth(
            request.headers.get("authorization"),
            process.env.PORTAL_SUPPORT_API_TOKEN,
          );
          if (auth !== "ok")
            return supportJson(
              {
                error:
                  auth === "misconfigured"
                    ? "Support is unavailable."
                    : "Unauthorized.",
              },
              auth === "misconfigured" ? 503 : 401,
            );
        }
        const service = new SupportService(resolveDb());
        const actor =
          audience === "staff" ? await staff(request, service) : undefined;
        const params = context ? await context.params : {};
        if (Object.values(params).some((value) => !supportId(value)))
          throw new SupportError(404, "Ticket not found.");
        const result = await operation(request, service, params, actor);
        return result instanceof Response ? result : supportJson(result);
      } catch (error) {
        if (error instanceof SupportError)
          return supportJson({ error: error.message }, error.status);
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          return supportJson(
            { error: "Check the request and try again." },
            400,
          );
        console.error("[support] Request could not be completed.");
        return supportJson(
          { error: "Support is unavailable. Please try again." },
          503,
        );
      }
    };
  }
  return {
    health: route("portal", async (_r, service) => {
      await service.db.collection("companies").select("name").limit(1).get();
      return {
        ready: true,
        mailgunDomain: process.env.MAILGUN_DOMAIN || null,
        messagingReady:
          !!process.env.MAILGUN_DOMAIN &&
          !!process.env.MAILGUN_API_KEY &&
          !process.env.MAILGUN_API_KEY.startsWith("your-") &&
          !!process.env.MAILGUN_SIGNING_KEY &&
          !process.env.MAILGUN_SIGNING_KEY.startsWith("your-"),
      };
    }),
    companies: route("portal", async (_r, service) => service.companies()),
    list: route("portal", async (_r, service, p) =>
      service.list(p.resourceId!),
    ),
    detail: route("portal", async (_r, service, p) =>
      service.detail(p.ticketId!, p.resourceId!),
    ),
    create: route("portal", async (r, service, p) => {
      const body = await supportBody(r);
      return service.create(
        p.resourceId!,
        supportCreateInput.parse(body.payload),
        body.files,
      );
    }),
    reply: route("portal", async (r, service, p) => {
      const body = await supportBody(r);
      const input = supportReplyInput
        .extend({
          email: z
            .string()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          name: z.string().trim().min(1).max(200),
        })
        .parse(body.payload);
      return service.reply(
        p.ticketId!,
        input.request_id,
        input.text,
        { name: input.name, email: input.email, direction: "client" },
        body.files,
        p.resourceId!,
      );
    }),
    download: route("portal", async (_r, service, p) =>
      service.download(p.ticketId!, p.messageId!, p.fileId!, p.resourceId!),
    ),
    staffDetail: route("staff", async (_r, service, p) =>
      service.detail(p.ticketId!, undefined, true),
    ),
    staffReply: route("staff", async (r, service, p, actor) => {
      const body = await supportBody(r),
        input = supportReplyInput.parse(body.payload);
      return service.reply(
        p.ticketId!,
        input.request_id,
        input.text,
        actor!,
        body.files,
      );
    }),
    staffDownload: route("staff", async (_r, service, p) =>
      service.download(p.ticketId!, p.messageId!, p.fileId!, undefined, true),
    ),
    visibility: route("staff", async (r, service, p) => {
      const { payload } = await supportBody(r);
      const input = z.object({ shared: z.boolean() }).strict().parse(payload);
      await service.db.runTransaction(async (tx) => {
        const ref = service.db.collection("tickets").doc(p.ticketId!);
        const ticket = (await tx.get(ref)).data();
        if (
          !ticket ||
          ticket.workspace !== "Support Tickets" ||
          ticket.parentId
        )
          throw new SupportError(404, "Ticket not found.");
        if (
          input.shared &&
          (!supportId(ticket.companyId) || !supportEmail(ticket.email))
        )
          throw new SupportError(
            400,
            "Set the company and requester email in ticket details before sharing.",
          );
        tx.update(ref, {
          supportVisibility: input.shared ? "client" : "internal",
        });
      });
      return service.detail(p.ticketId!, undefined, true);
    }),
    retry: route("staff", async (_r, service, p) => {
      await service.ticket(p.ticketId!);
      if (!supportId(p.messageId))
        throw new SupportError(404, "Message not found.");
      const message = (
        await service.db
          .collection("tickets")
          .doc(p.ticketId!)
          .collection("messages")
          .doc(p.messageId)
          .get()
      ).data();
      if (!message || message.visibility !== "client")
        throw new SupportError(404, "Message not found.");
      await service.notify(p.ticketId!, p.messageId);
      return service.detail(p.ticketId!, undefined, true);
    }),
  };
}
