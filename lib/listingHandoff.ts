type Row = {
  id: string;
  parentId?: string;
  projectName?: string;
  companyId?: string;
  status?: string;
  username?: string;
  password?: string;
  url?: string;
  loginUrl?: string;
};
type Company = {
  id: string;
  name?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  domain?: string;
};
export function listingHandoff(
  rows: Row[],
  selected: ReadonlySet<string>,
  companies: Company[],
) {
  const parents = new Set(
    rows.filter((r) => selected.has(r.id) && !r.parentId).map((r) => r.id),
  );
  const included = rows.filter(
    (r) =>
      (selected.has(r.id) || (!!r.parentId && parents.has(r.parentId))) &&
      (!!r.parentId || !rows.some((child) => child.parentId === r.id)),
  );
  const headers = [
    "Client",
    "Directory",
    "Status",
    "Username",
    "Password",
    "Link",
  ];
  const values = included.map((row) => {
    const parent = rows.find((p) => p.id === row.parentId);
    const company = companies.find(
      (c) => c.id === (row.companyId || parent?.companyId),
    );
    return [
      company?.name || parent?.projectName || "",
      row.parentId ? row.projectName || "" : "",
      row.status || "",
      row.username || "",
      row.password || "",
      row.loginUrl || row.url || "",
    ];
  });
  return { headers, values };
}
