import { automaticSeo } from "./portalSeoAutomatic";
import { FieldPath } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getPortalListingsFirestore } from "./portalListingsDb";
import { checkListingsAuth, validDocumentId } from "./portalListings";
import { seoOptions, projectSeo, diagnoseSeo, eligibleSeo } from "./portalSeo";
import { publicPagePreview } from "./portalSeoPreview";
import { publicSeoPublication } from "./portalSeoPublications";
import { seoBoardGroups, seoGroupVisible } from "./portalSeoGroups";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createSeoHandler(resolveDb = getPortalListingsFirestore) {
  return async (
    request: NextRequest,
    context?: { params: Promise<{ groupId: string }> },
  ) => {
    const auth = checkListingsAuth(
      request.headers.get("authorization"),
      process.env.PORTAL_LISTINGS_API_TOKEN,
    );
    if (auth !== "ok")
      return json(
        {
          error:
            auth === "misconfigured" ? "Service unavailable." : "Unauthorized.",
        },
        auth === "misconfigured" ? 503 : 401,
      );
    try {
      const db = resolveDb();
      if (!context) {
        const groups = await db
          .collection("groups")
          .where("workspace", "==", "SEO")
          .select("workspace", "name", "companyId", "order")
          .orderBy(FieldPath.documentId())
          .limit(501)
          .get();
        if (groups.size > 500) throw new Error("Too many groups");
        const records = groups.docs.map((d) => ({ id: d.id, data: d.data() }));
        const companyIds = [
          ...new Set(
            records.map((g) => g.data.companyId).filter(validDocumentId),
          ),
        ];
        const companies = companyIds.length
          ? await db.getAll(
              ...companyIds.map((id) => db.collection("companies").doc(id)),
              { fieldMask: ["seo"] },
            )
          : [];
        const flags = new Map(companies.map((c) => [c.id, c.data()?.seo]));
        return json({
          groups: seoBoardGroups(records, flags).map((g) => ({
            id: g.id,
            name:
              typeof g.data.name === "string"
                ? g.data.name.slice(0, 200)
                : "SEO group",
          })),
        });
      }
      const { groupId } = await context.params;
      if (!validDocumentId(groupId))
        return json({ error: "Invalid group." }, 400);
      const automatic = !request.nextUrl.searchParams.has("options");
      const parsed = seoOptions.safeParse(
        JSON.parse(request.nextUrl.searchParams.get("options") ?? "{}"),
      );
      if (!automatic && !parsed.success)
        return json({ error: "Explicit field mapping required." }, 400);
      const options = parsed.success ? parsed.data : null;
      const fields = [
        ...new Set([
          "workspace",
          "groupId",
          "parentId",
          ...(automatic
            ? [
                "projectName",
                "status",
                "deadline",
                "url",
                "portalVisibility",
                "order",
              ]
            : Object.values(options!.fields)
          ).filter((v): v is string => typeof v === "string"),
        ]),
      ];
      // Transaction gives one coherent view of moves/deletions and parent validation.
      const projection = await db.runTransaction(
        async (tx) => {
          const currentGroup = await tx.get(
            db.collection("groups").doc(groupId),
          );
          if (!currentGroup.exists || currentGroup.data()?.workspace !== "SEO")
            return null;
          const group = currentGroup.data()!;
          const company = validDocumentId(group.companyId)
            ? (
                await tx.getAll(
                  db.collection("companies").doc(group.companyId),
                  { fieldMask: automatic ? ["seo", "domain"] : ["seo"] },
                )
              )[0]
            : undefined;
          if (!seoGroupVisible(group, company?.data()?.seo)) return null;
          const tickets = await tx.get(
            db
              .collection("tickets")
              .where("groupId", "==", groupId)
              .select(...fields)
              .limit(1001),
          );
          if (tickets.size > 1000) throw new Error("Too many tasks");
          const records = tickets.docs.map((d) => ({
            id: d.id,
            data: d.data(),
          }));
          if (automatic)
            return automaticSeo(records, groupId, company?.data()?.domain);
          return {
            items: projectSeo(records, groupId, options!),
            diagnostics: diagnoseSeo(records, groupId, options!),
          };
        },
        { readOnly: true },
      );
      if (!projection)
        return json(
          { error: "SEO section is not available on the SEO board." },
          404,
        );
      const { items } = projection;
      const effectiveOptions =
        "options" in projection ? projection.options : options!;
      if (request.nextUrl.searchParams.get("previews") === "1") {
        const period = request.nextUrl.searchParams.get("period");
        if (period && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
          return json({ error: "Invalid report month." }, 400);
        const candidates = eligibleSeo(items, effectiveOptions)
          .filter((i) => !period || i.allocatedPeriod === period)
          .slice(0, 12);
        for (let offset = 0; offset < candidates.length; offset += 3)
          await Promise.all(
            candidates.slice(offset, offset + 3).map(async (item) => {
              if ("publicOrigin" in projection && projection.publicOrigin) {
                const publication = await publicSeoPublication(
                  item.title,
                  projection.publicOrigin,
                  item.url,
                  undefined,
                  item.allocatedPeriod ?? undefined,
                );
                if (publication) Object.assign(item, publication);
              } else if (item.url) {
                const preview = await publicPagePreview(item.url);
                if (preview) Object.assign(item, { preview });
              }
            }),
          );
      }
      return json({
        group: { id: groupId, workspace: "SEO" },
        items,
        ...("setup" in projection
          ? {
              sourceVersion: 2,
              publicOrigin: projection.publicOrigin,
              setup: projection.setup,
            }
          : { diagnostics: projection.diagnostics }),
      });
    } catch {
      return json({ error: "SEO work could not be loaded." }, 503);
    }
  };
}
