import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { seoPublicUrl } from "./portalSeo";

// Fetch a pinned public IPv4 address. TLS still verifies the original hostname.
// This prevents a second DNS lookup from rebinding to a private address.
export function publicIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export async function publicPagePreview(
  value: string,
  dependencies: {
    resolve4: (hostname: string) => Promise<string[]>;
    request: typeof request;
  } = { resolve4, request },
) {
  const safe = seoPublicUrl(value);
  if (!safe || new URL(safe).protocol !== "https:") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const addresses = await Promise.race([
      dependencies.resolve4(new URL(safe).hostname),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Timeout")),
          { once: true },
        ),
      ),
    ]);
    if (!addresses.length || addresses.some((ip) => !publicIpv4(ip)))
      return null;
    const html = await new Promise<string>((resolve, reject) => {
      const req = dependencies.request(
        safe,
        {
          signal: controller.signal,
          agent: false,
          family: 4,
          lookup: (_host, _options, callback) =>
            callback(null, addresses[0], 4),
          headers: {
            Accept: "text/html",
            "Accept-Encoding": "identity",
            "User-Agent": "Awebco-Portal-Preview/1.0",
          },
        },
        (res) => {
          // No redirects, authentication, cookies, compression, or error documents.
          if (
            /noindex/i.test(String(res.headers["x-robots-tag"] ?? "")) ||
            res.statusCode !== 200 ||
            !res.headers["content-type"]?.includes("text/html") ||
            (res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity")
          ) {
            res.destroy();
            reject(new Error("Not public HTML"));
            return;
          }
          let bytes = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 256_000) res.destroy(new Error("Too large"));
            else chunks.push(chunk);
          });
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
    const metas = [...html.matchAll(/<meta\s+[^>]*>/gi)];
    function meta(name: string) {
      for (const [tag] of metas) {
        const attrs = Object.fromEntries(
          [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
            m[1].toLowerCase(),
            m[2],
          ]),
        );
        if (attrs.property === name || attrs.name === name)
          return attrs.content ?? null;
      }
      return null;
    }
    if (
      /noindex/i.test(meta("robots") ?? "") ||
      /noindex/i.test(meta("googlebot") ?? "")
    )
      return null;
    const text = (v: string | null) =>
      v
        ?.replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240) || null;
    const title = text(
      meta("og:title") ??
        html.match(/<title[^>]*>([^]*?)<\/title>/i)?.[1] ??
        null,
    );
    const imageValue = meta("og:image");
    const image = imageValue
      ? seoPublicUrl(new URL(imageValue, safe).href, new URL(safe).origin)
      : null;
    return { title, image };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
