import { getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import { getPortalListingsFirestore } from "../portalListingsDb";
import {
  belongsToResource,
  isRootTicket,
  mapListingStatus,
  paginateSafeRows,
  readCursor,
  safeListingUrl,
  validDocumentId,
} from "../portalListings";

type Data = Record<string, unknown>;
type Database = ReturnType<typeof getPortalListingsFirestore>;
export class ExtensionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function canUseListings(profile: Data | undefined) {
  if (!profile || profile.disabled === true) return false;
  if (profile.role === "master_admin" || profile.role === "admin") return true;
  if (profile.role !== "staff" && profile.role !== "freelancer") return false;
  const permissions = profile.permissions as
    { allowedWorkspaces?: unknown } | undefined;
  if (permissions?.allowedWorkspaces !== undefined)
    return (
      Array.isArray(permissions.allowedWorkspaces) &&
      permissions.allowedWorkspaces.includes("Local Listings")
    );
  return profile.role === "staff";
}
const text = (value: unknown, max = 300) =>
  typeof value === "string" && value.length <= max ? value : "";
export function privateListing(id: string, data: Data) {
  if (!validDocumentId(id) || !text(data.projectName, 200).trim())
    throw new ExtensionError("A directory row needs review in the CRM.", 409);
  return {
    id,
    name: text(data.projectName, 200).trim(),
    status: mapListingStatus(data.status),
    url: safeListingUrl(data.url),
    loginUrl: text(data.loginUrl || data.url, 2048),
    username: text(data.username, 254),
    password: text(data.password, 4096),
  };
}
export function resourceDetails(id: string, parent: Data, company?: Data) {
  if (
    !validDocumentId(id) ||
    !text(parent.projectName, 200).trim() ||
    (parent.companyId && !validDocumentId(parent.companyId))
  )
    throw new ExtensionError("A client row needs review in the CRM.", 409);
  return {
    id,
    name: text(parent.projectName, 200).trim(),
    ...(parent.companyId ? { companyId: parent.companyId } : {}),
    clientName: text(company?.name, 200),
    business: {
      businessName: text(parent.businessName || company?.name),
      address:
        text(parent.address, 1000) ||
        [
          text(company?.street),
          text(company?.city),
          text(company?.state),
          text(company?.zipcode),
        ]
          .filter(Boolean)
          .join(", "),
      phone: text(parent.phone || company?.phone, 100),
      website: text(
        parent.website || company?.domain || company?.website,
        2048,
      ),
      hours: text(parent.hours || company?.hoursOfOperation, 2000),
    },
  };
}
async function authenticate(request: Request, database: Database) {
  const token = /^Bearer (\S+)$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token || token.length > 8000)
    throw new ExtensionError("Sign in with your CRM account.", 401);
  let uid: string;
  try {
    uid = (await getAuth(getApp()).verifyIdToken(token, true)).uid;
  } catch {
    throw new ExtensionError("Sign in with your CRM account again.", 401);
  }
  if (
    !canUseListings((await database.collection("users").doc(uid).get()).data())
  )
    throw new ExtensionError(
      "Your CRM account does not have Local Listings access.",
      403,
    );
  return uid;
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof ExtensionError
          ? error.message
          : "CRM listings are temporarily unavailable.",
    },
    error instanceof ExtensionError ? error.status : 503,
  );
}
export function extensionHandlers(
  resolveDb = getPortalListingsFirestore,
  authorize = authenticate,
) {
  async function context(request: Request) {
    if (!/^Bearer \S+$/.test(request.headers.get("authorization") || ""))
      throw new ExtensionError("Sign in with your CRM account.", 401);
    const db = resolveDb();
    const uid = await authorize(request, db);
    return { db, uid };
  }
  async function recheck(db: Database, uid: string) {
    if (!canUseListings((await db.collection("users").doc(uid).get()).data()))
      throw new ExtensionError(
        "Your CRM account does not have Local Listings access.",
        403,
      );
  }
  const fields = [
    "workspace",
    "parentId",
    "projectName",
    "companyId",
    "businessName",
    "address",
    "phone",
    "website",
    "hours",
  ];
  async function details(db: Database, id: string, data: Data) {
    let company = validDocumentId(data.companyId)
      ? (await db.collection("companies").doc(data.companyId).get()).data()
      : undefined;
    if (company) {
      const siblings = await db
        .collection("tickets")
        .where("companyId", "==", data.companyId)
        .select("workspace", "parentId")
        .limit(201)
        .get();
      const roots = siblings.docs.filter(
        (record) =>
          record.data().workspace === "Local Listings" &&
          isRootTicket(record.data()),
      );
      // A main-office address is not authority for several business locations.
      if (
        siblings.docs.length > 200 ||
        roots.length !== 1 ||
        roots[0].id !== id
      )
        company = {
          name: company.name,
          domain: company.domain,
          website: company.website,
        };
    }
    return resourceDetails(id, data, company);
  }
  return {
    resources: async (request: Request) => {
      try {
        const { db, uid } = await context(request);
        const cursor = readCursor(
          new URL(request.url).searchParams.getAll("cursor"),
        );
        if (cursor === null)
          throw new ExtensionError("Invalid inventory page.", 400);
        let query = db
          .collection("tickets")
          .where("workspace", "==", "Local Listings")
          .select(...fields)
          .orderBy(FieldPath.documentId());
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.limit(201).get();
        const page = paginateSafeRows(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            data: doc.data() as Data,
          })),
          (id, data) => (isRootTicket(data) ? resourceDetails(id, data) : null),
        );
        const resources = [];
        for (const entry of page.items) {
          const record = snapshot.docs.find((d) => d.id === entry.id)!;
          resources.push(await details(db, entry.id, record.data()));
        }
        await recheck(db, uid);
        return json({ resources, nextCursor: page.nextCursor });
      } catch (error) {
        return failure(error);
      }
    },
    resource: async (request: Request, resourceId: string) => {
      try {
        const { db, uid } = await context(request);
        if (!validDocumentId(resourceId))
          throw new ExtensionError("Client not found.", 404);
        const parent = await db.collection("tickets").doc(resourceId).get();
        const data = parent.data();
        if (!data || data.workspace !== "Local Listings" || !isRootTicket(data))
          throw new ExtensionError("Client not found.", 404);
        const resource = await details(db, parent.id, data);
        const cursor = readCursor(
          new URL(request.url).searchParams.getAll("cursor"),
        );
        if (cursor === null)
          throw new ExtensionError("Invalid inventory page.", 400);
        let query = db
          .collection("tickets")
          .where("parentId", "==", resourceId)
          .select(
            "workspace",
            "parentId",
            "companyId",
            "projectName",
            "status",
            "url",
            "loginUrl",
            "username",
            "password",
          )
          .orderBy(FieldPath.documentId());
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.limit(201).get();
        const page = paginateSafeRows(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            data: doc.data() as Data,
          })),
          (id, row) =>
            belongsToResource(
              row,
              resourceId,
              resource.companyId as string | undefined,
            )
              ? privateListing(id, row)
              : null,
        );
        await recheck(db, uid);
        return json({
          resource,
          listings: page.items,
          nextCursor: page.nextCursor,
        });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
