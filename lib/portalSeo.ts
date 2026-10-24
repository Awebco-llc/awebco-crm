import { z } from "zod";
import { safeListingUrl } from "./portalListings";
const field = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/)
  .refine(
    (value) =>
      !/password|secret|token|notes|description|updates|files|email|username|assignee|workspace|groupId|parentId|companyId|createdAt|updatedAt/i.test(
        value,
      ),
  );
export const seoOptions = z.object({
  fields: z
    .object({
      title: field,
      status: field,
      allocation: field,
      visibility: field,
      url: field,
      year: field.optional(),
    })
    .refine(
      (fields) =>
        new Set(Object.values(fields)).size === Object.values(fields).length,
      "Use a distinct field for public approval.",
    ),
  publicValue: z.string().min(1).max(80),
  doneValue: z.string().min(1).max(80),
  periods: z
    .record(z.string().max(100), z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/))
    .refine(
      (v) =>
        Object.keys(v).length <= 24 &&
        Object.entries(v).every(
          ([raw, period]) =>
            raw.match(/20\d{2}/g)?.length === 1 &&
            raw.includes(period.slice(0, 4)),
        ),
      "Each planned value must include its explicit year.",
    ),
  publicOrigin: z.string().url(),
});
export type SeoOptions = z.infer<typeof seoOptions>;
export type SeoRecord = { id: string; data: Record<string, unknown> };
export function seoPublicUrl(value: unknown, origin?: string): string | null {
  if (typeof value !== "string") return null;
  const safe = safeListingUrl(value);
  if (!safe) return null;
  const u = new URL(safe);
  if (
    u.search ||
    u.hash ||
    u.port ||
    !u.hostname.includes(".") ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":") ||
    /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(u.hostname) ||
    /\/(wp-admin|wp-login\.php|preview|draft)(\/|$)/i.test(u.pathname)
  )
    return null;
  return !origin || u.origin === new URL(origin).origin ? u.href : null;
}
export function projectSeo(
  records: SeoRecord[],
  groupId: string,
  options: SeoOptions,
) {
  const byId = new Map(records.map((r) => [r.id, r]));
  if (byId.size !== records.length) throw new Error("Duplicate tasks.");
  function visible(record: SeoRecord, seen = new Set<string>()): boolean {
    const d = record.data;
    if (
      seen.has(record.id) ||
      d.workspace !== "SEO" ||
      d.groupId !== groupId ||
      d[options.fields.visibility] !== options.publicValue
    )
      return false;
    seen.add(record.id);
    if (!d.parentId) return true;
    const parent = typeof d.parentId === "string" && byId.get(d.parentId);
    return !!parent && visible(parent, seen);
  }
  return records.map((record) => {
    const d = record.data,
      approved = visible(record),
      title = d[options.fields.title],
      status = d[options.fields.status],
      allocation = d[options.fields.allocation];
    const year = options.fields.year ? d[options.fields.year] : undefined;
    const allocationKey =
      typeof allocation === "string" &&
      (!options.fields.year || typeof year === "string")
        ? allocation + (options.fields.year ? " | " + year : "")
        : null;
    return {
      id: record.id,
      parentId:
        typeof d.parentId === "string" &&
        /^[A-Za-z0-9_-]{1,256}$/.test(d.parentId)
          ? d.parentId
          : null,
      groupId,
      workspace: "SEO" as const,
      visible: approved,
      title:
        approved && typeof title === "string" && title.trim()
          ? title.trim().slice(0, 240)
          : "SEO work",
      status: approved && typeof status === "string" ? status.slice(0, 80) : "",
      allocatedPeriod:
        approved &&
        allocationKey !== null &&
        Object.hasOwn(options.periods, allocationKey)
          ? options.periods[allocationKey]
          : null,
      url: approved
        ? seoPublicUrl(d[options.fields.url], options.publicOrigin)
        : null,
    };
  });
}

// Admin-only aggregate diagnostics. No hidden titles, raw values, notes or task records.
export function diagnoseSeo(
  records: SeoRecord[],
  groupId: string,
  options: SeoOptions,
) {
  const scoped = records.filter(
    (r) => r.data.workspace === "SEO" && r.data.groupId === groupId,
  );
  const errors: string[] = [],
    warnings: string[] = [];
  const fields = Object.entries(options.fields).map(([key, id]) => {
    const present = scoped.filter((r) => Object.hasOwn(r.data, id)).length;
    const usable = scoped.filter(
      (r) => typeof r.data[id] === "string" && (r.data[id] as string).trim(),
    ).length;
    if (
      !present &&
      !(key === "visibility" && id === "portalVisibility") &&
      !(key === "url" && id === "url") &&
      scoped.length
    )
      errors.push(`${key}: field “${id}” was not found in this group.`);
    if (present && !usable && !["url", "visibility"].includes(key))
      errors.push(`${key}: field “${id}” has no usable text values.`);
    return { key, id, present };
  });
  const projected = projectSeo(scoped, groupId, options);
  const approved = projected.filter((i) => i.visible);
  const completed = approved.filter((i) => i.status === options.doneValue);
  const unallocated = completed.filter((i) => !i.allocatedPeriod).length;
  const eligible = eligibleSeo(projected, options);
  if (!scoped.length)
    warnings.push(
      "This group has no tasks yet. Field values cannot be verified until a task exists.",
    );
  if (!approved.length)
    warnings.push(
      "No tasks and ancestors are approved for client reports. Use Show in client reports in CRM.",
    );
  if (unallocated)
    warnings.push(
      `${unallocated} approved completed tasks have no mapped month and year.`,
    );
  if (!Object.keys(options.periods).length)
    warnings.push("No planned values are mapped to report months yet.");
  return {
    errors,
    warnings,
    fields,
    scanned: scoped.length,
    approved: approved.length,
    completed: completed.length,
    eligible: eligible.length,
    unallocated,
    sample: eligible[0]
      ? {
          title: eligible[0].title,
          status: eligible[0].status,
          allocatedPeriod: eligible[0].allocatedPeriod,
          url: eligible[0].url,
        }
      : null,
  };
}

export function eligibleSeo(
  items: ReturnType<typeof projectSeo>,
  options: SeoOptions,
) {
  const byId = new Map(items.map((i) => [i.id, i])),
    parents = new Set(items.map((i) => i.parentId));
  const complete = (i: (typeof items)[number]) =>
    i.visible && i.status === options.doneValue && !!i.allocatedPeriod;
  return items.filter((i) => {
    if (!complete(i) || (parents.has(i.id) && !i.url)) return false;
    let parent = i.parentId ? byId.get(i.parentId) : undefined;
    const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      if (
        complete(parent) &&
        parent.url &&
        parent.allocatedPeriod === i.allocatedPeriod
      )
        return false;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return true;
  });
}
