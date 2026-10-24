import assert from "node:assert/strict";
import test from "node:test";
import { automaticSeo, plannedSeoPeriod } from "../lib/portalSeoAutomatic";
import { eligibleSeo, type SeoRecord } from "../lib/portalSeo";
const groupId = "real-shape-group";
const row = (id: string, data: Record<string, unknown>): SeoRecord => ({
  id,
  data: { workspace: "SEO", groupId, ...data },
});
test("mapped SEO groups include completed assigned-month work without approval and preserve explicit privacy", () => {
  const records = [
    row("calendar", { projectName: "Content calendar", status: "In Progress" }),
    row("page", {
      parentId: "calendar",
      projectName: "September service page",
      status: " done ",
      deadline: "2026-09-30",
      updatedAt: "2026-10-24",
      url: "client-site.com/september/",
      comments: "PRIVATE",
      password: "SECRET",
    }),
    row("work", {
      projectName: "Updated navigation",
      status: "Done",
      deadline: "2026-09-01",
    }),
    row("pending", { status: "In Progress", deadline: "2026-09-02" }),
    row("october", { status: "Done", deadline: "2026-10-01" }),
    row("hidden", {
      portalVisibility: "Hidden",
      status: "Done",
      deadline: "2026-09-01",
    }),
    row("child", {
      parentId: "hidden",
      status: "Done",
      deadline: "2026-09-01",
    }),
    row("invalid", {
      portalVisibility: "unexpected",
      status: "Done",
      deadline: "2026-09-01",
    }),
    row("listings", {
      workspace: "Local Listings",
      status: "Done",
      deadline: "2026-09-01",
    }),
  ];
  const before = JSON.stringify(records);
  const result = automaticSeo(records, groupId, "client-site.com");
  const september = eligibleSeo(result.items, result.options).filter(
    (i) => i.allocatedPeriod === "2026-09",
  );
  assert.deepEqual(
    september.map((i) => i.id),
    ["page", "work"],
  );
  assert.equal(september[0].status, "Done");
  assert.equal(september[0].url, "https://client-site.com/september/");
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE|SECRET|comments|password|updatedAt/,
  );
  assert.equal(JSON.stringify(records), before);
  assert.ok(!result.setup.notices.some((n) => /approv/.test(n)));
});
test("assigned CRM date preserves calendar month/year across timezones and rejects invalid or ambiguous values", () => {
  const before = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      assert.equal(plannedSeoPeriod("2026-03-01"), "2026-03");
      assert.equal(plannedSeoPeriod("2025-12-27"), "2025-12");
      assert.equal(plannedSeoPeriod("2024-02-29"), "2024-02");
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
  for (const invalid of [
    "March",
    "03/2026",
    "2025-02-29",
    "2026-13-01",
    "2026-03-00",
    "2026-03-01T00:00:00Z",
    undefined,
  ])
    assert.equal(plannedSeoPeriod(invalid), null);
});
test("native plan/subtask projection uses assigned date, keeps admin preview useful, and respects hidden ancestors and site URLs", () => {
  const records = [
    row("plan", {
      projectName: "2026 Content Calendar",
      status: "In Progress",
    }),
    row("page", {
      parentId: "plan",
      projectName: "Home Care Carmel",
      status: "Done",
      deadline: "2025-12-27",
      url: "www.pacificangelshomecare.com/blog/home-care-in-carmel-ca/",
      notes: "PRIVATE_NOTE",
      password: "SECRET",
      updatedAt: "2026-10-24",
    }),
    row("private", {
      parentId: "plan",
      projectName: "A private task",
      status: "Not Started",
      deadline: "2026-03-28",
      portalVisibility: "Hidden",
    }),
    row("adhoc", {
      projectName: "Added service pages to navigation",
      status: "Done",
      deadline: "2026-05-25",
    }),
    row("missing", {
      projectName: "2026 task has no assigned date",
      status: "Done",
      updatedAt: "2026-01-01",
    }),
  ];
  const result = automaticSeo(records, groupId, "pacificangelshomecare.com");
  assert.equal(result.publicOrigin, "https://pacificangelshomecare.com/");
  assert.equal(
    result.items.find((i) => i.id === "page")?.allocatedPeriod,
    "2025-12",
  );
  assert.equal(
    result.items.find((i) => i.id === "page")?.url,
    "https://www.pacificangelshomecare.com/blog/home-care-in-carmel-ca/",
  );
  assert.equal(
    result.items.find((i) => i.id === "missing")?.allocatedPeriod,
    null,
  );
  assert.equal(result.items.find((i) => i.id === "private")?.title, "SEO work");
  assert.equal(
    result.setup.samples.find((i) => i.title === "A private task")?.approved,
    false,
  );
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_NOTE|SECRET|updatedAt/);
  records[0].data.portalVisibility = "Hidden";
  assert.equal(
    automaticSeo(records, groupId, "pacificangelshomecare.com").items.find(
      (i) => i.id === "page",
    )?.visible,
    false,
  );
});
test("moves, missing parents, cycles and unsafe or unrelated URLs never become public report data", () => {
  const records = [
    row("moved", { projectName: "Other tenant", workspace: "Local Listings" }),
    row("orphan", { parentId: "absent", projectName: "Orphan" }),
    row("a", { parentId: "b" }),
    row("b", { parentId: "a" }),
    ...[
      "https://client-site.com/draft/page",
      "https://client-site.com/page?token=secret",
      "https://127.0.0.1/",
      "https://other-site.com/page",
      "https://name:pass@client-site.com/",
    ].map((url, i) =>
      row("bad" + i, {
        projectName: "Page",
        status: "Done",
        deadline: "2026-03-28",
        url,
      }),
    ),
  ];
  const result = automaticSeo(records, groupId, "client-site.com");
  assert.equal(
    result.items.some((i) => i.id === "moved"),
    false,
  );
  assert.ok(
    result.items
      .filter((i) => ["a", "b", "orphan"].includes(i.id))
      .every((i) => !i.visible),
  );
  assert.ok(result.items.every((i) => i.url === null));
  assert.equal(
    automaticSeo(
      [
        row("text", {
          projectName: "Text work",
          status: "Done",
          deadline: "2026-03-28",
        }),
      ],
      groupId,
      "",
    ).items[0].url,
    null,
  );
});
