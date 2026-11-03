import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseListings,
  privateListing,
  resourceDetails,
} from "../lib/extension/listings";
import { listingHandoff } from "../lib/listingHandoff";
import * as XLSX from "xlsx";
test("extension staff access matches the existing CRM Local Listings board permissions", () => {
  for (const role of ["master_admin", "admin", "staff"])
    assert.equal(canUseListings({ role }), true);
  assert.equal(canUseListings({ role: "freelancer" }), false);
  assert.equal(
    canUseListings({
      role: "freelancer",
      permissions: { allowedWorkspaces: ["Local Listings"] },
    }),
    true,
  );
  assert.equal(
    canUseListings({ role: "staff", permissions: { allowedWorkspaces: [] } }),
    false,
  );
  assert.equal(canUseListings({ role: "client" }), false);
  assert.equal(canUseListings({ role: "admin", disabled: true }), false);
});
test("native CRM projection includes only the listing fields and preserves credential bytes", () => {
  const projected = privateListing("row-1", {
    projectName: "Directory",
    username: "user",
    password: "  SYNTHETIC_PASSWORD\n ",
    url: "https://example.com/login",
    notes: "PRIVATE_NOTE",
    token: "PRIVATE_TOKEN",
  });
  assert.equal(projected.password, "  SYNTHETIC_PASSWORD\n ");
  assert.equal("notes" in projected, false);
  assert.equal("token" in projected, false);
});
test("approved NAP comes from the exact CRM company, with no name-based record matching", () => {
  const resource = resourceDetails(
    "root-1",
    { projectName: "Main location", companyId: "company-1" },
    {
      name: "Company",
      street: "123 Example",
      city: "Chicago",
      phone: "555-0100",
    },
  );
  assert.equal(resource.clientName, "Company");
  assert.equal(resource.business.address, "123 Example, Chicago");
  assert.equal(resource.business.phone, "555-0100");
  assert.throws(() =>
    resourceDetails("root-1", { projectName: "Main", companyId: "../invalid" }),
  );
});
test("client handoff includes every child even if credential columns are hidden and never includes another client", () => {
  const rows = [
    { id: "client-1", projectName: "Client", companyId: "company-1" },
    {
      id: "directory-1",
      parentId: "client-1",
      projectName: "Directory",
      username: "user",
      password: "SYNTHETIC_PASSWORD",
    },
    { id: "directory-2", parentId: "client-1", projectName: "Pending" },
    {
      id: "directory-other",
      parentId: "client-2",
      projectName: "Other client",
      password: "UNRELATED",
    },
  ];
  const output = listingHandoff(rows, new Set(["client-1", "directory-1"]), [
    { id: "company-1", name: "Client" },
  ]);
  assert.equal(output.values.length, 2);
  assert.equal(output.values[0][4], "SYNTHETIC_PASSWORD");
  assert.equal(
    output.values.some((row) => row.includes("UNRELATED")),
    false,
  );
  assert.ok(output.headers.includes("Password"));
});
test("normal Excel handoff keeps passwords readable and formula-looking strings literal without a passphrase", () => {
  const password = "=SYNTHETIC_FORMULA()";
  const { headers, values } = listingHandoff(
    [
      {
        id: "row-1",
        parentId: "client-1",
        projectName: "Directory",
        username: "00123",
        password,
      },
    ],
    new Set(["row-1"]),
    [],
  );
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...values]);
  assert.equal(sheet.E2.t, "s");
  assert.equal(sheet.E2.f, undefined);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Directory logins");
  const reopened = XLSX.read(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
    { type: "buffer" },
  );
  assert.equal(reopened.Sheets["Directory logins"].E2.v, password);
  assert.equal(reopened.Sheets["Directory logins"].D2.v, "00123");
});

import { extensionHandlers } from "../lib/extension/listings";
test("direct API denies signed-out access before loading Firestore and sanitizes failures", async () => {
  const handlers = extensionHandlers(() => {
    throw new Error("SYNTHETIC_PRIVATE_FAILURE");
  });
  const response = await handlers.resources(
    new Request("https://crm.example/api/extension/listings/resources"),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.text()).includes("SYNTHETIC"), false);
});
test("private CRM API returns only direct in-scope rows and rechecks the existing staff permission", async () => {
  type Data = Record<string, unknown>;
  const tables: Record<string, Record<string, Data>> = {
    users: { staff: { role: "staff" } },
    companies: { company: { name: "Client", phone: "555-0100" } },
    tickets: {
      root: {
        workspace: "Local Listings",
        projectName: "Main",
        companyId: "company",
      },
      child: {
        workspace: "Local Listings",
        parentId: "root",
        projectName: "Directory",
        companyId: "company",
        username: "user",
        password: "SYNTHETIC_PRIVATE_PASSWORD",
        notes: "PRIVATE_NOTE",
      },
      other: {
        workspace: "SEO",
        parentId: "root",
        projectName: "Wrong board",
        password: "UNRELATED",
      },
      otherCompany: {
        workspace: "Local Listings",
        parentId: "root",
        companyId: "other",
        projectName: "Wrong company",
        password: "UNRELATED",
      },
    },
  };
  class Query {
    filters: Array<[unknown, unknown]> = [];
    selected: string[] = [];
    maximum = 201;
    cursor = "";
    constructor(public table: string) {}
    where(field: unknown, _op: string, value: unknown) {
      this.filters.push([field, value]);
      return this;
    }
    select(...fields: string[]) {
      this.selected = fields;
      return this;
    }
    orderBy() {
      return this;
    }
    startAfter(cursor: string) {
      this.cursor = cursor;
      return this;
    }
    limit(maximum: number) {
      this.maximum = maximum;
      return this;
    }
    doc(id: string) {
      return { get: async () => ({ id, data: () => tables[this.table][id] }) };
    }
    async get() {
      const docs = Object.entries(tables[this.table])
        .filter(
          ([id, data]) =>
            id > this.cursor &&
            this.filters.every(([field, value]) =>
              typeof field === "string" ? data[field] === value : id === value,
            ),
        )
        .slice(0, this.maximum)
        .map(([id, data]) => ({
          id,
          data: () =>
            this.selected.length
              ? Object.fromEntries(
                  this.selected
                    .filter((f) => f in data)
                    .map((f) => [f, data[f]]),
                )
              : data,
        }));
      return { docs, empty: !docs.length };
    }
  }
  const db = { collection: (name: string) => new Query(name) };
  const handlers = extensionHandlers(
    () => db as never,
    async () => "staff",
  );
  const request = () =>
    new Request("https://crm.example/api/extension/listings/resources/root", {
      headers: { Authorization: "Bearer SYNTHETIC_ID" },
    });
  const response = await handlers.resource(request(), "root");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.resource.business.phone, "555-0100");
  assert.equal(body.listings.length, 1);
  assert.equal(body.listings[0].password, "SYNTHETIC_PRIVATE_PASSWORD");
  assert.equal(JSON.stringify(body).includes("PRIVATE_NOTE"), false);
  assert.equal(JSON.stringify(body).includes("UNRELATED"), false);
  tables.users.staff = {
    role: "staff",
    permissions: { allowedWorkspaces: [] },
  };
  assert.equal((await handlers.resource(request(), "root")).status, 403);
  assert.equal((await handlers.resource(request(), "../root")).status, 404);
});
