import { FieldPath } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { getPortalListingsFirestore } from '@/lib/portalListingsDb';
import {
  belongsToResource,
  checkListingsAuth,
  isRootTicket,
  LISTINGS_PAGE_SIZE,
  LISTINGS_WORKSPACE,
  paginateSafeRows,
  readCursor,
  toPublicListing,
  toPublicResource,
  validDocumentId,
} from '@/lib/portalListings';

type Database = ReturnType<typeof getPortalListingsFirestore>;
type DatabaseResolver = () => Database;
type RouteContext = { params: Promise<{ resourceId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function checkAuthorization(request: NextRequest) {
  const result = checkListingsAuth(request.headers.get('authorization'), process.env.PORTAL_LISTINGS_API_TOKEN);
  if (result === 'misconfigured') return json({ error: 'Service unavailable.' }, 503);
  if (result !== 'ok') return json({ error: 'Unauthorized.' }, 401);
  return null;
}

function malformedRow(message: string): never {
  throw new Error(message);
}

export function createListResourcesHandler(resolveDb: DatabaseResolver = getPortalListingsFirestore) {
  return async function listResources(request: NextRequest) {
    const authorizationError = checkAuthorization(request);
    if (authorizationError) return authorizationError;
    const cursor = readCursor(new URL(request.url).searchParams.getAll('cursor'));
    if (cursor === null) return json({ error: 'Invalid cursor.' }, 400);

    try {
      const db = resolveDb();
      let query = db.collection('tickets')
        .where('workspace', '==', LISTINGS_WORKSPACE)
        .select('workspace', 'parentId', 'projectName', 'companyId')
        .orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(LISTINGS_PAGE_SIZE + 1).get();
      const page = paginateSafeRows(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() as Record<string, unknown> })), (id, data) =>
        isRootTicket(data) ? toPublicResource(id, data) ?? malformedRow('Malformed resource row.') : null,
      );
      return json({ resources: page.items, nextCursor: page.nextCursor });
    } catch {
      console.error('[GET /api/portal/listings/resources] Request failed.');
      return json({ error: 'Unable to load resources.' }, 500);
    }
  };
}

export function createGetResourceHandler(resolveDb: DatabaseResolver = getPortalListingsFirestore) {
  return async function getResource(request: NextRequest, context: RouteContext) {
    const authorizationError = checkAuthorization(request);
    if (authorizationError) return authorizationError;
    const { resourceId } = await context.params;
    if (!validDocumentId(resourceId)) return json({ error: 'Invalid resource ID.' }, 400);
    const cursor = readCursor(new URL(request.url).searchParams.getAll('cursor'));
    if (cursor === null) return json({ error: 'Invalid cursor.' }, 400);

    try {
      const db = resolveDb();
      const parentSnapshot = await db.collection('tickets')
        .where(FieldPath.documentId(), '==', resourceId)
        .select('workspace', 'parentId', 'projectName', 'companyId')
        .limit(1)
        .get();
      if (parentSnapshot.empty) return json({ error: 'Resource not found.' }, 404);
      const parentDoc = parentSnapshot.docs[0];
      const parentData = parentDoc.data() as Record<string, unknown>;
      if (parentData.workspace !== LISTINGS_WORKSPACE || !isRootTicket(parentData)) return json({ error: 'Resource not found.' }, 404);
      const resource = toPublicResource(parentDoc.id, parentData);
      if (!resource) return json({ error: 'Resource data is unavailable.' }, 500);

      let query = db.collection('tickets')
        .where('parentId', '==', resourceId)
        .select('workspace', 'parentId', 'companyId', 'projectName', 'status', 'url')
        .orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(LISTINGS_PAGE_SIZE + 1).get();
      const page = paginateSafeRows(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() as Record<string, unknown> })), (id, data) =>
        belongsToResource(data, resourceId, resource.companyId) ? toPublicListing(id, data) ?? malformedRow('Malformed listing row.') : null,
      );
      return json({ resource, listings: page.items, nextCursor: page.nextCursor });
    } catch {
      console.error('[GET /api/portal/listings/resources/:resourceId] Request failed.');
      return json({ error: 'Unable to load resource.' }, 500);
    }
  };
}
