import { z } from "zod";
import { seoPublicUrl } from "./portalSeo";
import { publicPagePreview, publicSiteJson } from "./portalSeoPreview";

const resultSchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      url: z.string(),
      subtype: z.enum(["page", "post"]),
    }),
  )
  .max(20);
const pageSchema = z.object({
  id: z.number().int().positive(),
  status: z.literal("publish"),
  date: z.string().optional(),
  type: z.enum(["page", "post"]),
  link: z.string(),
  title: z.object({ rendered: z.string() }),
  _embedded: z
    .object({
      "wp:featuredmedia": z
        .array(z.object({ source_url: z.string().optional() }))
        .optional(),
    })
    .optional(),
});
const words = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&#\d+;|&[a-z]+;/g, " ")
    .replace(/\bac\b/g, "air conditioner")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    );
const generic = new Set([
  "a",
  "an",
  "the",
  "and",
  "for",
  "in",
  "of",
  "to",
  "create",
  "created",
  "publish",
  "published",
  "write",
  "written",
  "page",
  "pages",
  "post",
  "posts",
  "service",
  "services",
]);

// Only a unique published title match can fill a missing link. No guessed slugs,
// private task fields, cross-site results, or CRM writes.
export async function publicSeoPublication(
  title: string,
  origin: string,
  existingUrl: string | null,
  dependencies = { json: publicSiteJson, preview: publicPagePreview },
  allocatedPeriod?: string,
): Promise<{
  url: string;
  preview: {
    title: string | null;
    image: string | null;
    kind?: "page" | "post";
  };
} | null> {
  const site = seoPublicUrl(origin);
  if (!site || new URL(site).protocol !== "https:") return null;
  const sameSite = (value: string) => {
    const safe = seoPublicUrl(value);
    return safe &&
      new URL(safe).protocol === "https:" &&
      new URL(safe).hostname.replace(/^www\./, "") ===
        new URL(site).hostname.replace(/^www\./, "")
      ? safe
      : null;
  };
  if (existingUrl && !sameSite(existingUrl)) return null;
  const terms = [
    ...new Set(words(title).filter((w) => w.length > 1 && !generic.has(w))),
  ];
  if (terms.length < 2 && !existingUrl) return null;
  const parsed = resultSchema.safeParse(
    await dependencies.json(site, "/wp-json/wp/v2/search", {
      search: terms.join(" "),
      subtype: "page,post",
      per_page: "20",
      _fields: "id,title,url,subtype",
    }),
  );
  // A full result page could conceal another match. Leave ambiguous work as text.
  let matches =
    parsed.success && parsed.data.length < 20
      ? parsed.data.filter((item) => {
          if (!sameSite(item.url)) return false;
          if (existingUrl) return sameSite(item.url) === sameSite(existingUrl);
          const candidate = new Set(words(item.title));
          const count = terms.filter((term) => candidate.has(term)).length;
          // Long editorial task titles may differ by one descriptive word. Short
          // service names still require every meaningful term, and all matches
          // must remain unique (or have one verified publication-month match).
          return (
            count === terms.length ||
            (terms.length >= 6 && count === terms.length - 1)
          );
        })
      : [];
  const readPage = async (match: z.infer<typeof resultSchema>[number]) =>
    pageSchema.safeParse(
      await dependencies.json(
        site,
        `/wp-json/wp/v2/${match.subtype === "page" ? "pages" : "posts"}/${match.id}`,
        {
          context: "view",
          _embed: "wp:featuredmedia",
          _fields: "id,date,status,type,link,title,_links,_embedded",
        },
      ),
    );
  const documents = new Map<number, Awaited<ReturnType<typeof readPage>>>();
  // A parent service page and its newly created child can share a title topic.
  // Use WordPress's publication month to resolve only a single verified match.
  // Never fetch an unbounded set of candidate documents.
  if (
    matches.length > 1 &&
    matches.length <= 3 &&
    allocatedPeriod &&
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(allocatedPeriod)
  ) {
    await Promise.all(
      matches.map(async (match) =>
        documents.set(match.id, await readPage(match)),
      ),
    );
    matches = matches.filter((match) => {
      const page = documents.get(match.id);
      return (
        page?.success &&
        page.data.id === match.id &&
        page.data.type === match.subtype &&
        sameSite(page.data.link) === sameSite(match.url) &&
        /^20\d{2}-(0[1-9]|1[0-2])-\d{2}T/.test(page.data.date ?? "") &&
        page.data.date?.slice(0, 7) === allocatedPeriod
      );
    });
  }
  if (matches.length === 1) {
    const match = matches[0];
    const page = documents.get(match.id) ?? (await readPage(match));
    if (
      page.success &&
      page.data.id === match.id &&
      page.data.type === match.subtype &&
      sameSite(page.data.link) === sameSite(match.url)
    ) {
      const url = sameSite(page.data.link)!;
      // Preserve the HTML robots/noindex check before showing a discovered page.
      const metadata = await dependencies.preview(url);
      if (!metadata) return null;
      const candidate =
        page.data._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
      const image = candidate && seoPublicUrl(candidate, new URL(url).origin);
      return {
        url,
        preview: {
          title: null,
          image:
            image && new URL(image).protocol === "https:"
              ? image
              : metadata.image,
          kind: match.subtype,
        },
      };
    }
  }
  // Explicit CRM links can still use ordinary public HTML metadata on non-WP sites.
  if (existingUrl) {
    const preview = await dependencies.preview(existingUrl);
    if (preview) return { url: existingUrl, preview };
  }
  return null;
}
