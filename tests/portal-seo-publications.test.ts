import test from "node:test";
import assert from "node:assert/strict";
import { publicSeoPublication } from "../lib/portalSeoPublications";

const site = "https://client-site.com/";
const page = {
  id: 3432,
  title: "Fire Damage Restoration in Danville, IL",
  url: site + "fire-damage-restoration/",
  subtype: "page",
};
const detail = {
  id: 3432,
  status: "publish",
  type: "page",
  link: page.url,
  title: { rendered: page.title },
  _embedded: { "wp:featuredmedia": [{ source_url: site + "hero.webp" }] },
};
function fixtures(
  results: unknown = [page],
  document: unknown = detail,
  publicHtml = true,
) {
  const calls: string[] = [];
  return {
    calls,
    json: async (_origin: string, path: string) => {
      calls.push(path);
      return path.endsWith("search") ? results : document;
    },
    preview: async () =>
      publicHtml ? { title: page.title, image: null } : null,
  };
}
test("a unique published page title supplies its actual link and featured image without guessing a slug", async () => {
  const deps = fixtures([page, { ...page, id: 1, title: "Home", url: site }]);
  const result = await publicSeoPublication(
    "Fire Restoration Services",
    site,
    null,
    deps,
  );
  assert.deepEqual(result, {
    url: page.url,
    preview: { title: null, image: site + "hero.webp", kind: "page" },
  });
  assert.deepEqual(deps.calls, [
    "/wp-json/wp/v2/search",
    "/wp-json/wp/v2/pages/3432",
  ]);
});
test("ambiguous, generic, truncated, cross-site, private and noindex matches stay text-only", async () => {
  for (const results of [
    [],
    [page, { ...page, id: 4 }],
    Array.from({ length: 20 }, () => page),
    [{ ...page, url: "https://other-site.com/fire/" }],
  ]) {
    assert.equal(
      await publicSeoPublication(
        "Fire Restoration Services",
        site,
        null,
        fixtures(results),
      ),
      null,
    );
  }
  assert.equal(
    await publicSeoPublication("Services", site, null, fixtures()),
    null,
  );
  for (const bad of [
    { ...detail, status: "draft" },
    { ...detail, id: 2 },
    { ...detail, link: "https://other-site.com/" },
  ])
    assert.equal(
      await publicSeoPublication(
        "Fire Restoration Services",
        site,
        null,
        fixtures([page], bad),
      ),
      null,
    );
  assert.equal(
    await publicSeoPublication(
      "Fire Restoration Services",
      site,
      null,
      fixtures([page], detail, false),
    ),
    null,
  );
});
test("blog posts use the same projection and reject unrelated featured images", async () => {
  const post = { ...page, subtype: "post" };
  const data = {
    ...detail,
    type: "post",
    _embedded: {
      "wp:featuredmedia": [{ source_url: "https://other-site.com/image.webp" }],
    },
  };
  const result = await publicSeoPublication(
    "Fire Restoration Services",
    site,
    null,
    fixtures([post], data),
  );
  assert.equal(result?.preview.image, null);
  assert.equal(result?.preview.kind, "post");
});
test("explicit safe CRM links retain the non-WordPress public metadata fallback", async () => {
  const deps = fixtures([]);
  const result = await publicSeoPublication(
    "Fire Restoration Services",
    site,
    page.url,
    deps,
  );
  assert.equal(result?.url, page.url);
  assert.equal(result?.preview.title, page.title);
  assert.equal(
    await publicSeoPublication(
      "Fire Restoration Services",
      site,
      "https://other-site.com/",
      deps,
    ),
    null,
  );
});

import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import { IncomingMessage, type ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { publicSiteJson, publicPagePreview } from "../lib/portalSeoPreview";
test("public WordPress JSON may be noindex, while the actual page HTML must remain indexable", async () => {
  const transport = ((
    url: string | URL,
    _options: unknown,
    callback: (res: IncomingMessage) => void,
  ) => {
    const isJson = String(url).includes("/wp-json/");
    const req = new EventEmitter() as ClientRequest;
    req.end = (() => {
      queueMicrotask(() => {
        const response = new IncomingMessage(new Socket());
        response.statusCode = 200;
        response.headers = {
          "content-type": isJson ? "application/json" : "text/html",
          "x-robots-tag": "noindex",
        };
        callback(response);
        response.push(
          Buffer.from(
            isJson ? "[]" : "<head><title>Private page</title></head>",
          ),
        );
        response.push(null);
      });
      return req;
    }) as ClientRequest["end"];
    return req;
  }) as typeof httpsRequest;
  const deps = { resolve4: async () => ["93.184.215.14"], request: transport };
  assert.deepEqual(
    await publicSiteJson(
      site,
      "/wp-json/wp/v2/search",
      { search: "fire restoration" },
      deps,
    ),
    [],
  );
  assert.equal(await publicPagePreview(site + "private/", deps), null);
  assert.equal(await publicSiteJson(site, "/wp-admin/", {}, deps), null);
});

test("published titles normalize plurals and AC and permit only one changed word in long editorial titles", async () => {
  for (const [task, title] of [
    ["Solar Farms", "Solar Farm Construction in Vermilion County, IL"],
    [
      "Heat Pump vs. Traditional AC: What’s Best for Illinois Summers?",
      "Heat Pump vs Air Conditioner: What&#8217;s Best for Illinois Summers?",
    ],
  ]) {
    const match = { ...page, title };
    assert.equal(
      (
        await publicSeoPublication(
          task,
          site,
          null,
          fixtures([match], { ...detail, title: { rendered: title } }),
        )
      )?.url,
      page.url,
    );
    assert.equal(
      await publicSeoPublication(
        task,
        site,
        null,
        fixtures([match, { ...match, id: 4 }]),
      ),
      null,
    );
  }
  assert.equal(
    await publicSeoPublication(
      "Commercial Mold Remediation",
      site,
      null,
      fixtures([{ ...page, title: "Residential Mold Remediation" }]),
    ),
    null,
  );
  assert.equal(
    await publicSeoPublication(
      "Heat Pump vs Traditional AC: Best Illinois Summer Savings",
      site,
      null,
      fixtures([{ ...page, title: "Heat Pump Maintenance Guide" }]),
    ),
    null,
  );
});

test("the source publication month resolves competing service titles only when exactly one public document matches", async () => {
  const results = [
    {
      ...page,
      id: 234,
      title: "Heating & Air Conditioning",
      url: site + "hvac/",
    },
    {
      ...page,
      id: 3152,
      title: "Air Conditioning Repair & Replacement",
      url: site + "ac-repair/",
    },
  ];
  let secondDate = "2026-06-05T10:41:44";
  let firstDate = "2025-07-22T09:50:02";
  const calls: string[] = [];
  const deps = {
    json: async (_site: string, path: string) => {
      calls.push(path);
      if (path.endsWith("search")) return results;
      const match = results.find((item) => path.endsWith(String(item.id)))!;
      return {
        ...detail,
        id: match.id,
        link: match.url,
        date: match.id === 234 ? firstDate : secondDate,
      };
    },
    preview: async () => ({ title: null, image: site + "ac.webp" }),
  };
  assert.equal(
    await publicSeoPublication("Air Conditioning Services", site, null, deps),
    null,
  );
  const resolved = await publicSeoPublication(
    "Air Conditioning Services",
    site,
    null,
    deps,
    "2026-06",
  );
  assert.equal(resolved?.url, site + "ac-repair/");
  assert.equal(calls.filter((path) => path.endsWith("3152")).length, 1); // Reuse the checked document.
  firstDate = secondDate;
  assert.equal(
    await publicSeoPublication(
      "Air Conditioning Services",
      site,
      null,
      deps,
      "2026-06",
    ),
    null,
  );
  secondDate = "invalid";
  firstDate = "2026-05-01T00:00:00";
  assert.equal(
    await publicSeoPublication(
      "Air Conditioning Services",
      site,
      null,
      deps,
      "2026-06",
    ),
    null,
  );
});
