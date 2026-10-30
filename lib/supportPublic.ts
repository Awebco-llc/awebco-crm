import type { Firestore } from "firebase-admin/firestore";
import { getPortalListingsFirestore } from "./portalListingsDb";
import {
  fingerprint,
  replyAddress,
  supportEmail,
  supportId,
  supportTeamAccess,
} from "./supportPolicy";
import { SupportError } from "./supportService";

export type PublicSupportInput = {
  entryId: string;
  subject: string;
  description: string;
  email: string;
  contactName: string;
  companyName: string;
  category: string;
  priority: string;
  files: Array<{ id: string; name: string; url: string; uploadedAt: string }>;
};
export async function verifiedSupportCompany(
  db: Firestore,
  email: string,
  name: string,
) {
  const normalized = supportEmail(email);
  if (!normalized || !name) return null;
  const [companies, contacts] = await Promise.all([
    db
      .collection("companies")
      .where("name", "==", name)
      .select("name")
      .limit(2)
      .get(),
    db
      .collection("contacts")
      .where("email", "==", normalized)
      .select("companyId")
      .limit(3)
      .get(),
  ]);
  if (companies.size !== 1 || contacts.empty || contacts.size > 2) return null;
  const identities = [
    ...new Set(
      contacts.docs.map((doc) => doc.data().companyId).filter(supportId),
    ),
  ];
  return identities.length === 1 && identities[0] === companies.docs[0].id
    ? identities[0]
    : null;
}
export async function upsertPublicSupport(
  input: PublicSupportInput,
  resolveDb = getPortalListingsFirestore,
) {
  if (!/^\d{1,12}$/.test(input.entryId) || !supportEmail(input.email))
    throw new SupportError(400, "Invalid support request.");
  const db = resolveDb(),
    companyId = await verifiedSupportCompany(
      db,
      input.email,
      input.companyName,
    );
  const deterministicId = fingerprint(["awebco.com", 80, input.entryId]).slice(
    0,
    24,
  );
  return db.runTransaction(async (tx) => {
    const deterministic = db.collection("tickets").doc(deterministicId),
      saved = await tx.get(deterministic);
    if (saved.exists) {
      if (supportEmail(saved.data()?.email) !== supportEmail(input.email))
        throw new SupportError(409, "Ticket identity changed.");
      return deterministicId;
    }
    // Resending an existing Gravity Forms notification adopts its original CRM ticket.
    const candidates = await tx.get(
      db
        .collection("tickets")
        .where("projectName", "==", input.subject)
        .where("workspace", "==", "Support Tickets")
        .limit(3),
    );
    const matches = candidates.docs.filter(
      (doc) =>
        supportEmail(doc.data().email) === supportEmail(input.email) &&
        doc.data().companyName === input.companyName &&
        doc.data().isManual === false,
    );
    if (candidates.size > 1 || (candidates.size && matches.length !== 1))
      throw new SupportError(409, "The existing ticket needs review.");
    if (matches.length) {
      const original = matches[0];
      tx.update(original.ref, {
        supportSource: "awebco.com",
        supportEntryId: input.entryId,
        ...(!original.data().companyId && companyId ? { companyId } : {}),
      });
      // The source marker is queried on retries; the actual ticket ID stays unchanged.
      return original.id;
    }
    const prior = await tx.get(
      db
        .collection("tickets")
        .where("supportSource", "==", "awebco.com")
        .where("supportEntryId", "==", input.entryId)
        .limit(2),
    );
    if (prior.size) {
      if (
        prior.size !== 1 ||
        supportEmail(prior.docs[0].data().email) !== supportEmail(input.email)
      )
        throw new SupportError(409, "The existing ticket needs review.");
      return prior.docs[0].id;
    }
    const at = new Date().toISOString();
    tx.create(deterministic, {
      projectName: input.subject,
      description: input.description || "No content",
      workspace: "Support Tickets",
      groupId: "group-active",
      status: "Not Started",
      priority: input.priority,
      category: input.category,
      email: supportEmail(input.email),
      contactName: input.contactName,
      companyName: input.companyName,
      ...(companyId ? { companyId } : {}),
      assignee: "",
      assignees: [],
      assignedToId: "",
      isManual: false,
      notes: "",
      createdAt: at,
      updatedAt: at,
      order: Date.now(),
      files: input.files,
      supportVisibility: "client",
      supportSource: "awebco.com",
      supportEntryId: input.entryId,
    });
    return deterministicId;
  });
}
export async function publicSupportReplyRoute(
  ticketId: string,
  to: unknown,
  resolveDb = getPortalListingsFirestore,
) {
  const db = resolveDb(),
    ticket = (await db.collection("tickets").doc(ticketId).get()).data();
  if (!ticket || ticket.workspace !== "Support Tickets")
    throw new SupportError(404, "Ticket not found.");
  const targets = (
    Array.isArray(to) ? to : typeof to === "string" ? to.split(",") : []
  ).map(supportEmail);
  if (!targets.length || targets.some((value) => !value)) return null;
  let audience: "team" | "client";
  if (targets.length === 1 && targets[0] === supportEmail(ticket.email))
    audience = "client";
  else {
    const team = await db.collection("users").limit(101).get();
    if (team.size > 100) return null;
    const authorized = new Set(
      team.docs
        .filter((doc) => supportTeamAccess(doc.data()))
        .map((doc) => supportEmail(doc.data().email)),
    );
    if (!targets.every((email) => authorized.has(email))) return null;
    audience = "team";
  }
  const domain = process.env.MAILGUN_DOMAIN,
    key = process.env.MAILGUN_SIGNING_KEY;
  if (!domain || !key) return null;
  return {
    audience,
    reply_to: replyAddress(
      ticketId,
      audience === "team" ? "support-team@awebco.com" : targets[0]!,
      domain,
      key,
    ),
  };
}
