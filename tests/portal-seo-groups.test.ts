import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createSeoHandler } from "../lib/portalSeoHandlers";
import { seoBoardGroups, seoGroupVisible } from "../lib/portalSeoGroups";
import { seoOptions } from "../lib/portalSeo";

test("SEO discovery mirrors board eligibility and numeric order, preserving IDs and stable ties", () => {
  const groups = [
    { id: "retained", data: { workspace: "SEO", companyId: "old", order: 0 } },
    { id: "later", data: { workspace: "SEO", companyId: "active", order: 3 } },
    { id: "manual", data: { workspace: "SEO", order: 1 } },
    {
      id: "missing-company",
      data: { workspace: "SEO", companyId: "gone", order: 2 },
    },
    {
      id: "unset-flag",
      data: { workspace: "SEO", companyId: "unset", order: 2 },
    },
    {
      id: "listings",
      data: { workspace: "Local Listings", companyId: "active", order: 0 },
    },
  ];
  const before = JSON.stringify(groups);
  assert.deepEqual(
    seoBoardGroups(
      groups,
      new Map([
        ["old", false],
        ["active", true],
      ]),
    ).map((g) => g.id),
    ["manual", "missing-company", "unset-flag", "later"],
  );
  assert.equal(JSON.stringify(groups), before);
  assert.equal(
    seoGroupVisible({ workspace: "SEO", companyId: "active" }, true),
    true,
  );
  assert.equal(
    seoGroupVisible({ workspace: "SEO", companyId: "old" }, false),
    false,
  );
  assert.equal(seoGroupVisible({ workspace: "SEO" }, false), true);
});
const config = seoOptions.parse({
  fields: {
    title: "projectName",
    status: "status",
    allocation: "month",
    visibility: "portalVisibility",
    url: "url",
  },
  publicValue: "Approved",
  doneValue: "Done",
  periods: { "September 2026": "2026-09" },
  publicOrigin: "https://client-site.com/",
});
const token = "test-token-that-is-at-least-thirty-two-characters";
test("live API discovery filters retained groups and detail rejects before any task read, including after eligibility changes", async () => {
  const previous = process.env.PORTAL_LISTINGS_API_TOKEN;
  process.env.PORTAL_LISTINGS_API_TOKEN = token;
  const groups = [
    {
      id: "old",
      data: {
        workspace: "SEO",
        name: "Retained client",
        companyId: "disabled",
        order: 0,
      },
    },
    {
      id: "b",
      data: {
        workspace: "SEO",
        name: "Second",
        companyId: "enabled",
        order: 2,
      },
    },
    {
      id: "a",
      data: { workspace: "SEO", name: "First", companyId: "enabled", order: 1 },
    },
  ];
  let enabled = true,
    ticketReads = 0;
  const masks: string[][] = [];
  const doc = (collection: string, id: string) => ({ collection, id });
  const snapshot = (id: string, data: Record<string, unknown> | undefined) => ({
    id,
    exists: !!data,
    data: () => data,
  });
  const getAll = async (...args: unknown[]) => {
    const options = args.at(-1) as { fieldMask: string[] };
    masks.push(options.fieldMask);
    return (args.slice(0, -1) as { id: string }[]).map((ref) =>
      snapshot(ref.id, { seo: ref.id === "enabled" ? enabled : false }),
    );
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => doc(name, id),
      where: () => ({
        select: () => ({
          limit: () => ({ kind: "tickets" }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                size: groups.length,
                docs: groups.map((g) => snapshot(g.id, g.data)),
              }),
            }),
          }),
        }),
      }),
    }),
    getAll,
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        getAll,
        get: async (ref: { collection?: string; id?: string }) => {
          if (ref.collection === "groups") {
            const group = groups.find((g) => g.id === ref.id);
            return snapshot(ref.id!, group?.data);
          }
          ticketReads++;
          return { size: 0, docs: [] };
        },
      }),
  };
  const handler = createSeoHandler(() => db as never);
  const req = (path: string) =>
    new NextRequest("https://crm-site.com" + path, {
      headers: { authorization: `Bearer ${token}` },
    });
  try {
    const response = await handler(req("/api/portal/listings/seo/groups"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      groups: [
        { id: "a", name: "First" },
        { id: "b", name: "Second" },
      ],
    });
    const detail = (id: string) =>
      handler(
        req(
          "/api/portal/listings/seo/groups/" +
            id +
            "?options=" +
            encodeURIComponent(JSON.stringify(config)),
        ),
        { params: Promise.resolve({ groupId: id }) },
      );
    assert.equal((await detail("old")).status, 404);
    assert.equal(ticketReads, 0);
    assert.equal((await detail("a")).status, 200);
    assert.equal(ticketReads, 1);
    enabled = false;
    assert.equal((await detail("a")).status, 404);
    assert.equal(ticketReads, 1);
    assert.ok(masks.every((mask) => JSON.stringify(mask) === '["seo"]'));
  } finally {
    if (previous === undefined) delete process.env.PORTAL_LISTINGS_API_TOKEN;
    else process.env.PORTAL_LISTINGS_API_TOKEN = previous;
  }
});
