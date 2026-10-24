import {
  projectSeo,
  eligibleSeo,
  seoPublicUrl,
  type SeoRecord,
  type SeoOptions,
} from "./portalSeo";

// Deadline is the CRM's native date-only value. The owner confirmed that it
// designates the planned allocation, not when the task was completed.
export function plannedSeoPeriod(value: unknown): string | null {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const max = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  return max && day >= 1 && day <= max ? value.slice(0, 7) : null;
}
export function crmPublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed)
      ? `https://${trimmed}`
      : "";
  return seoPublicUrl(candidate);
}
function belongsToSite(value: string, origin: string) {
  return (
    new URL(value).hostname.replace(/^www\./, "") ===
    new URL(origin).hostname.replace(/^www\./, "")
  );
}
export function automaticSeo(
  records: SeoRecord[],
  groupId: string,
  domain: unknown,
) {
  const scoped = records.filter(
    (r) => r.data.workspace === "SEO" && r.data.groupId === groupId,
  );
  if (new Set(scoped.map((r) => r.id)).size !== scoped.length)
    throw new Error("Duplicate tasks");
  const site = crmPublicUrl(domain);
  const publicOrigin = site ? new URL(site).origin + "/" : null;
  const periods: Record<string, string> = {};
  const normalized = scoped.map((record) => {
    const period = plannedSeoPeriod(record.data.deadline);
    if (period) periods[record.data.deadline as string] = period;
    const candidate = crmPublicUrl(record.data.url);
    const url =
      candidate && publicOrigin && belongsToSite(candidate, publicOrigin)
        ? candidate
        : null;
    return {
      id: record.id,
      data: {
        ...record.data,
        status:
          typeof record.data.status === "string" &&
          record.data.status.trim().toLowerCase() === "done"
            ? "Done"
            : record.data.status,
        url,
      } as Record<string, unknown> & { url: string | null; status: unknown },
    };
  });
  const options: SeoOptions = {
    fields: {
      title: "projectName",
      status: "status",
      allocation: "deadline",
      visibility: "portalVisibility",
      url: "url",
    },
    publicValue: "Approved",
    doneValue: "Done",
    periods,
    publicOrigin: publicOrigin ?? "https://unavailable.invalid/",
  };
  // URLs have already been checked against the CRM company's website (www alias
  // included). Reuse the existing ancestor/isolation rules without an origin alias rewrite.
  const items = projectSeo(
    normalized.map((r) => ({ ...r, data: { ...r.data, url: null } })),
    groupId,
    options,
  ).map((item) => ({
    ...item,
    url: item.visible
      ? normalized.find((r) => r.id === item.id)!.data.url
      : null,
  }));
  const parents = new Set(items.map((i) => i.parentId));
  const previews = normalized
    .filter((r) => !parents.has(r.id))
    .sort(
      (a, b) =>
        Number(!!b.data.url) - Number(!!a.data.url) ||
        Number(a.data.order || 0) - Number(b.data.order || 0),
    )
    .slice(0, 3)
    .map((record) => {
      const item = items.find((i) => i.id === record.id)!;
      return {
        title:
          typeof record.data.projectName === "string" &&
          record.data.projectName.trim()
            ? record.data.projectName.trim().slice(0, 240)
            : "SEO work",
        status:
          typeof record.data.status === "string"
            ? record.data.status.slice(0, 80)
            : "Not started",
        allocatedPeriod: plannedSeoPeriod(record.data.deadline),
        url: record.data.url,
        subtask: !!record.data.parentId,
        approved: item.visible,
      };
    });
  const notices: string[] = [];
  const unallocated = normalized.filter(
    (r) => !parents.has(r.id) && !plannedSeoPeriod(r.data.deadline),
  ).length;
  if (unallocated)
    notices.push(
      `${unallocated} tasks have no valid assigned date in CRM. They will stay out of monthly reports until a date is set.`,
    );
  if (!publicOrigin)
    notices.push(
      "The CRM company has no public website. Task titles can still appear; page links will stay hidden.",
    );
  const approved = items.filter((i) => i.visible).length;
  if (!approved && scoped.length)
    notices.push(
      "No tasks are currently approved for reports. Review “Show in client reports” in CRM; connecting does not change task visibility.",
    );
  return {
    options,
    sourceVersion: 2 as const,
    publicOrigin,
    items,
    setup: {
      taskCount: scoped.length,
      completedCount: items.filter(
        (i) => normalized.find((r) => r.id === i.id)?.data.status === "Done",
      ).length,
      approvedCount: approved,
      reportReadyCount: new Set(
        eligibleSeo(items, options).map((i) =>
          i.url ? `${i.allocatedPeriod}|${i.url}` : i.id,
        ),
      ).size,
      notices,
      samples: previews,
    },
  };
}
