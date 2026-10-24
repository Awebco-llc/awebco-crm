import test from "node:test";
import assert from "node:assert/strict";
import { projectSeo, seoOptions } from "../lib/portalSeo";
import { publicIpv4, publicPagePreview } from "../lib/portalSeoPreview";
const options = seoOptions.parse({
  fields: {
    title: "projectName",
    status: "status",
    allocation: "custom_month",
    visibility: "custom_public",
    url: "url",
    year: "custom_year",
  },
  publicValue: "Approved",
  doneValue: "Done",
  periods: { "September | 2026": "2026-09" },
  publicOrigin: "https://client-site.com/",
});
const record = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  data: {
    workspace: "SEO",
    groupId: "client-a",
    projectName: "Public title",
    status: "Done",
    custom_month: "September",
    custom_year: "2026",
    custom_public: "Approved",
    url: "https://client-site.com/page",
    notes: "PRIVATE",
    password: "SECRET",
    ...data,
  },
});
test("explicit ticket[fieldId] projection; year is mapped, never inferred", () => {
  const [item] = projectSeo(
    [record("one", { updatedAt: "2030-01-01" })],
    "client-a",
    options,
  );
  assert.equal(item.allocatedPeriod, "2026-09");
  assert.doesNotMatch(
    JSON.stringify(item),
    /PRIVATE|SECRET|updatedAt|notes|password/,
  );
  assert.equal(
    projectSeo(
      [record("one", { custom_month: "October" })],
      "client-a",
      options,
    )[0].allocatedPeriod,
    null,
  );
});
test("hidden ancestors, deleted parents, moved tasks and cycles redact all public content", () => {
  for (const records of [
    [record("one", { custom_public: "" })],
    [
      record("parent", { custom_public: "" }),
      record("one", { parentId: "parent" }),
    ],
    [record("one", { parentId: "deleted" })],
    [record("one", { groupId: "other" })],
    [record("one", { workspace: "Other" })],
    [record("one", { parentId: "two" }), record("two", { parentId: "one" })],
  ]) {
    const items = projectSeo(records, "client-a", options);
    assert.ok(
      items.every(
        (i) =>
          !i.visible &&
          i.title === "SEO work" &&
          i.url === null &&
          i.allocatedPeriod === null,
      ),
    );
  }
  assert.equal(
    seoOptions.safeParse({
      ...options,
      fields: { ...options.fields, title: "notes" },
    }).success,
    false,
  );
});
test("preview denies nonpublic addresses, credential/preview URLs before transport", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "198.18.0.1",
  ])
    assert.equal(publicIpv4(ip), false, ip);
  assert.equal(publicIpv4("93.184.215.14"), true);
  for (const url of [
    "https://127.0.0.1/",
    "https://site.com/?preview=1",
    "https://u:p@site.com/",
    "file:///etc/passwd",
  ])
    assert.equal(await publicPagePreview(url), null);
});

import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import { IncomingMessage, type ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createSeoHandler } from "../lib/portalSeoHandlers";
import { NextRequest } from "next/server";

test("SEO route refuses unauthenticated reads before touching Firestore", async () => {
  const previous = process.env.PORTAL_LISTINGS_API_TOKEN;
  try {
    process.env.PORTAL_LISTINGS_API_TOKEN =
      "test-token-that-is-at-least-thirty-two-characters";
    const handler = createSeoHandler(() => {
      throw new Error("Must not reach database");
    });
    assert.equal(
      (
        await handler(
          new NextRequest(
            "https://crm-site.com/api/portal/listings/seo/groups",
          ),
        )
      ).status,
      401,
    );
    delete process.env.PORTAL_LISTINGS_API_TOKEN;
    assert.equal(
      (
        await handler(
          new NextRequest(
            "https://crm-site.com/api/portal/listings/seo/groups",
          ),
        )
      ).status,
      503,
    );
  } finally {
    if (previous) process.env.PORTAL_LISTINGS_API_TOKEN = previous;
    else delete process.env.PORTAL_LISTINGS_API_TOKEN;
  }
});

test("preview pins public DNS, refuses redirects/private DNS/oversize, and accepts bounded public metadata", async () => {
  let calls = 0;
  function transport(statusCode: number, html: string) {
    return ((
      _url: unknown,
      options: Record<string, unknown>,
      callback: (res: IncomingMessage) => void,
    ) => {
      calls++;
      assert.equal(options.agent, false);
      assert.equal(options.family, 4);
      const lookup = options.lookup as (
        _host: string,
        _opts: unknown,
        cb: (error: unknown, address: string, family: number) => void,
      ) => void;
      lookup("client-site.com", {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, "93.184.215.14");
        assert.equal(family, 4);
      });
      const req = new EventEmitter() as ClientRequest;
      req.end = (() => {
        queueMicrotask(() => {
          const response = new IncomingMessage(new Socket());
          response.statusCode = statusCode;
          response.headers = { "content-type": "text/html" };
          callback(response);
          response.push(Buffer.from(html));
          response.push(null);
        });
        return req;
      }) as ClientRequest["end"];
      return req;
    }) as typeof httpsRequest;
  }
  const dns = async () => ["93.184.215.14"];
  const metadata = await publicPagePreview("https://client-site.com/page", {
    resolve4: dns,
    request: transport(
      200,
      '<title>Fallback</title><meta property="og:title" content="Public &amp; useful"><meta property="og:image" content="/hero.jpg">',
    ),
  });
  assert.deepEqual(metadata, {
    title: "Public & useful",
    image: "https://client-site.com/hero.jpg",
  });
  assert.equal(
    await publicPagePreview("https://client-site.com/page", {
      resolve4: dns,
      request: transport(302, "redirect"),
    }),
    null,
  );
  assert.equal(
    await publicPagePreview("https://client-site.com/page", {
      resolve4: dns,
      request: transport(200, "x".repeat(256001)),
    }),
    null,
  );
  assert.equal(
    await publicPagePreview("https://client-site.com/page", {
      resolve4: dns,
      request: transport(
        200,
        '<meta name="robots" content="noindex"><title>Private</title>',
      ),
    }),
    null,
  );
  const before = calls;
  assert.equal(
    await publicPagePreview("https://client-site.com/page", {
      resolve4: async () => ["10.0.0.1"],
      request: transport(200, "private"),
    }),
    null,
  );
  assert.equal(calls, before);
});

test("same month in another year and missing years remain unallocated", () => {
  assert.equal(
    projectSeo([record("old", { custom_year: "2025" })], "client-a", options)[0]
      .allocatedPeriod,
    null,
  );
  assert.equal(
    projectSeo([record("unknown", { custom_year: "" })], "client-a", options)[0]
      .allocatedPeriod,
    null,
  );
  assert.equal(
    seoOptions.safeParse({ ...options, periods: { September: "2026-09" } })
      .success,
    false,
  );
});

import { diagnoseSeo, eligibleSeo } from "../lib/portalSeo";
test("mapping diagnostics reject nonexistent fields and allow a verified future plan without completed tasks", () => {
  const future = record("future", { status: "Not Started" });
  assert.deepEqual(diagnoseSeo([future], "client-a", options).errors, []);
  assert.equal(diagnoseSeo([future], "client-a", options).eligible, 0);
  const invalid = {
    ...options,
    fields: { ...options.fields, allocation: "missing_field" },
  };
  assert.match(
    diagnoseSeo([future], "client-a", invalid).errors.join(" "),
    /not found/,
  );
  const hidden = record("hidden", {
    custom_public: "Hidden",
    projectName: "PRIVATE TITLE",
  });
  assert.doesNotMatch(
    JSON.stringify(diagnoseSeo([hidden], "client-a", options)),
    /PRIVATE TITLE/,
  );
  const native = {
    ...options,
    fields: { ...options.fields, visibility: "portalVisibility" },
  };
  assert.equal(diagnoseSeo([future], "client-a", native).errors.length, 0);
  assert.match(
    diagnoseSeo([future], "client-a", native).warnings.join(" "),
    /No tasks/,
  );
  const parent = record("parent"),
    child = record("child", { parentId: "parent", url: "" });
  assert.equal(
    eligibleSeo(projectSeo([parent, child], "client-a", options), options)
      .length,
    1,
  );
});
