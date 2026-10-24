import { FieldPath } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getPortalListingsFirestore } from "./portalListingsDb";
import { checkListingsAuth, validDocumentId } from "./portalListings";
import { seoOptions, projectSeo } from "./portalSeo";
import { publicPagePreview } from "./portalSeoPreview";
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
          .select("workspace", "name")
          .limit(501)
          .get();
        if (groups.size > 500) throw new Error("Too many groups");
        return json({
          groups: groups.docs.map((d) => ({
            id: d.id,
            name:
              typeof d.data().name === "string"
                ? d.data().name.slice(0, 200)
                : "SEO group",
          })),
        });
      }
      const { groupId } = await context.params;
      if (!validDocumentId(groupId))
        return json({ error: "Invalid group." }, 400);
      const parsed = seoOptions.safeParse(
        JSON.parse(request.nextUrl.searchParams.get("options") ?? "{}"),
      );
      if (!parsed.success)
        return json({ error: "Explicit field mapping required." }, 400);
      const options = parsed.data;
      const group = await db.collection("groups").doc(groupId).get();
      if (!group.exists || group.data()?.workspace !== "SEO")
        return json({ error: "Group unavailable." }, 404);
      const fields = [
        ...new Set([
          "workspace",
          "groupId",
          "parentId",
          ...Object.values(options.fields).filter(
            (v): v is string => typeof v === "string",
          ),
        ]),
      ];
      // Transaction gives one coherent view of moves/deletions and parent validation.
      const items = await db.runTransaction(
        async (tx) => {
          const currentGroup = await tx.get(
            db.collection("groups").doc(groupId),
          );
          if (!currentGroup.exists || currentGroup.data()?.workspace !== "SEO")
            throw new Error("Group changed");
          const tickets = await tx.get(
            db
              .collection("tickets")
              .where("groupId", "==", groupId)
              .select(...fields)
              .limit(1001),
          );
          if (tickets.size > 1000) throw new Error("Too many tasks");
          return projectSeo(
            tickets.docs.map((d) => ({ id: d.id, data: d.data() })),
            groupId,
            options,
          );
        },
        { readOnly: true },
      );
      if (request.nextUrl.searchParams.get("previews") === "1") {
        // Explicit admin refresh only; normal report generation never fetches public pages.
        const parents = new Set(items.map((i) => i.parentId));
        await Promise.all(
          items
            .filter(
              (i) =>
                i.visible &&
                i.status === options.doneValue &&
                i.url &&
                !parents.has(i.id),
            )
            .slice(0, 12)
            .map(async (item) => {
              const preview = await publicPagePreview(item.url!);
              if (preview) Object.assign(item, { preview });
            }),
        );
      }
      return json({ group: { id: groupId, workspace: "SEO" }, items });
    } catch {
      return json({ error: "SEO work could not be loaded." }, 503);
    }
  };
}
