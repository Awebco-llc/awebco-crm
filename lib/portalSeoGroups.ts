import type { SeoRecord } from "./portalSeo";

// Mirrors WorkspaceProjectView's groups filter: only an existing linked
// company's explicit false service flag hides a group. Manual/unlinked and
// missing-company groups retain the board's existing behavior.
export function seoGroupVisible(
  group: Record<string, unknown>,
  companySeo: unknown,
) {
  return (
    group.workspace === "SEO" && !(group.companyId && companySeo === false)
  );
}
export function seoBoardGroups(
  groups: SeoRecord[],
  companyFlags: ReadonlyMap<string, unknown>,
) {
  return (
    groups
      .filter((group) =>
        seoGroupVisible(
          group.data,
          companyFlags.get(
            typeof group.data.companyId === "string"
              ? group.data.companyId
              : "",
          ),
        ),
      )
      // subscribeGroups uses the same numeric order, with stable document-order ties.
      .sort((a, b) => Number(a.data.order || 0) - Number(b.data.order || 0))
  );
}
