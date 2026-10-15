import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createGetResourceHandler, createListResourcesHandler } from '../lib/portalListingsHandlers';
import {
  belongsToResource,
  checkListingsAuth,
  isRootTicket,
  LISTINGS_WORKSPACE,
  mapListingStatus,
  paginateSafeRows,
  readCursor,
  safeListingUrl,
  toPublicListing,
  toPublicResource,
  validDocumentId,
} from '../lib/portalListings';

const token = 'test-token-that-is-at-least-thirty-two-characters';

test('requires the dedicated bearer token and rejects misconfiguration', () => {
  assert.equal(checkListingsAuth(`Bearer ${token}`, token), 'ok');
  assert.equal(checkListingsAuth(null, token), 'unauthorized');
  assert.equal(checkListingsAuth(token, token), 'unauthorized');
  assert.equal(checkListingsAuth(`Bearer ${token}`, 'short'), 'misconfigured');
  assert.equal(checkListingsAuth(`Bearer ${token}`, undefined), 'misconfigured');
  assert.equal(checkListingsAuth(`Bearer ${token} trailing`, token), 'unauthorized');
});

test('validates document IDs and cursors strictly', () => {
  assert.equal(validDocumentId('ticket-1'), true);
  assert.equal(validDocumentId(''), false);
  assert.equal(validDocumentId('a/b'), false);
  assert.equal(validDocumentId('business / location'), false);
  assert.equal(validDocumentId('a'.repeat(257)), false);
  assert.equal(validDocumentId('..'), false);
  assert.equal(validDocumentId('a\n'), false);
  assert.equal(readCursor([]), undefined);
  assert.equal(readCursor(['ticket-1']), 'ticket-1');
  assert.equal(readCursor(['ticket-1', 'ticket-2']), null);
  assert.equal(readCursor(['a/b']), null);
});

test('only lists root resources and direct children of the exact workspace', () => {
  assert.equal(isRootTicket({ workspace: LISTINGS_WORKSPACE }), true);
  assert.equal(isRootTicket({ parentId: 'parent' }), false);
  assert.equal(belongsToResource({ workspace: LISTINGS_WORKSPACE, parentId: 'parent' }, 'parent'), true);
  assert.equal(belongsToResource({ workspace: 'SEO', parentId: 'parent' }, 'parent'), false);
  assert.equal(belongsToResource({ workspace: LISTINGS_WORKSPACE, parentId: 'other' }, 'parent'), false);
  assert.equal(belongsToResource({ workspace: LISTINGS_WORKSPACE, parentId: 'parent', companyId: 'other' }, 'parent', 'company'), false);
  assert.equal(belongsToResource({ workspace: LISTINGS_WORKSPACE, parentId: 'parent', companyId: '' }, 'parent', 'company'), true);
  assert.equal(belongsToResource({ workspace: LISTINGS_WORKSPACE, parentId: 'parent', companyId: 'company' }, 'parent', 'company'), true);
});

test('projects only the public resource and listing fields', () => {
  assert.deepEqual(toPublicResource('parent', {
    projectName: 'Project', companyId: 'company', apiKey: 'secret', notes: 'internal',
  }), { id: 'parent', name: 'Project', companyId: 'company' });
  assert.deepEqual(toPublicResource('parent', { projectName: 'Project', apiKey: 'secret' }), { id: 'parent', name: 'Project' });
  assert.deepEqual(toPublicResource('parent', { projectName: 'Project', companyId: '' }), { id: 'parent', name: 'Project' });
  assert.equal(toPublicResource('parent', { projectName: ' ' }), null);
  assert.equal(toPublicResource('parent', { projectName: 'x'.repeat(201) }), null);
  assert.equal(toPublicResource('parent', { projectName: 'Project', companyId: 'bad id' }), null);
  assert.deepEqual(toPublicListing('child', {
    projectName: 'Listing', status: 'Running', url: 'https://example.com/path?q=1#top', password: 'secret',
  }), {
    id: 'child', name: 'Listing', status: 'active', url: 'https://example.com/path?q=1#top',
  });
});

test('maps Local Listings status values and defaults unknown values safely', () => {
  assert.equal(mapListingStatus('Running'), 'active');
  assert.equal(mapListingStatus('Down'), 'attention');
  assert.equal(mapListingStatus('On Hold'), 'on_hold');
  for (const status of ['Not Started', 'Setup', 'In Progress']) assert.equal(mapListingStatus(status), 'pending');
  assert.equal(mapListingStatus('Done'), 'unknown');
  assert.equal(mapListingStatus(undefined), 'unknown');
});

test('accepts only credential-free HTTP(S) listing URLs', () => {
  assert.equal(safeListingUrl('https://example.com/listing?place=1#details'), 'https://example.com/listing?place=1#details');
  assert.equal(safeListingUrl('https://example.com/listing?cid=abc&placeid=123&q=main+street#details'), 'https://example.com/listing?cid=abc&placeid=123&q=main+street#details');
  assert.equal(safeListingUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeListingUrl('javascript:alert(1)'), null);
  assert.equal(safeListingUrl('ftp://example.com'), null);
  assert.equal(safeListingUrl('https://user:pass@example.com'), null);
  for (const key of ['password', 'passwd', 'pass', 'token', 'access_token', 'refresh_token', 'id_token', 'api_key', 'apikey', 'secret', 'authorization', 'auth', 'username', 'user', 'login', 'email', 'key']) {
    assert.equal(safeListingUrl(`https://example.com/listing?${key}=secret`), null, `query parameter ${key}`);
  }
  assert.equal(safeListingUrl('https://example.com/listing?Access-Token=secret'), null);
  assert.equal(safeListingUrl('https://example.com/#access_token=secret'), null);
  assert.equal(safeListingUrl('https://example.com/#/callback?refresh-token=secret'), null);
  assert.equal(safeListingUrl('not a url'), null);
});

test('returns stable bounded pages with a document ID cursor', () => {
  const records = Array.from({ length: 201 }, (_, index) => ({
    id: `ticket-${String(index).padStart(3, '0')}`,
    data: { projectName: `Project ${index}` },
  }));
  const first = paginateSafeRows(records, (id, data) => toPublicResource(id, data));
  assert.equal(first.items.length, 200);
  assert.equal(first.items[0].id, 'ticket-000');
  assert.equal(first.items[199].id, 'ticket-199');
  assert.equal(first.nextCursor, 'ticket-199');
  const second = paginateSafeRows(records.slice(200), (id, data) => toPublicResource(id, data));
  assert.deepEqual(second.items.map(item => item.id), ['ticket-200']);
  assert.equal(second.nextCursor, null);
});

type FakeRow = { id: string; data: Record<string, unknown> };
type FakeQueryLog = { filters: Array<{ field: unknown; value: unknown }>; selected: string[]; limit?: number };

class FakeQuery {
  private filters: Array<{ field: unknown; value: unknown }> = [];
  private selected: string[] = [];
  private cursor?: string;
  private maximum = Number.MAX_SAFE_INTEGER;
  constructor(private rows: FakeRow[], private logs: FakeQueryLog[]) {}
  where(field: unknown, _operator: string, value: unknown) { this.filters.push({ field, value }); return this; }
  select(...fields: string[]) { this.selected = fields; return this; }
  orderBy() { return this; }
  startAfter(cursor: string) { this.cursor = cursor; return this; }
  limit(maximum: number) { this.maximum = maximum; return this; }
  async get() {
    this.logs.push({ filters: [...this.filters], selected: [...this.selected], limit: this.maximum });
    let rows = this.rows.filter(row => this.filters.every(({ field, value }) =>
      typeof field === 'string' ? row.data[field] === value : row.id === value,
    ));
    rows = rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (this.cursor) rows = rows.filter(row => row.id > this.cursor!);
    rows = rows.slice(0, this.maximum);
    const docs = rows.map(row => ({ id: row.id, data: () => row.data, get: (key: string) => row.data[key] }));
    return { docs, empty: docs.length === 0 };
  }
}

function fakeDatabase(rows: FakeRow[]) {
  const logs: FakeQueryLog[] = [];
  return {
    logs,
    db: { collection: () => ({ where: (field: unknown, operator: string, value: unknown) => new FakeQuery(rows, logs).where(field, operator, value) }) } as never,
  };
}

function request(path: string, authorization: string | null = `Bearer ${token}`) {
  return new NextRequest(`https://crm.example${path}`, {
    headers: authorization ? { authorization } : {},
  });
}

test('route authentication fails closed before accessing Firestore', async () => {
  const old = process.env.PORTAL_LISTINGS_API_TOKEN;
  process.env.PORTAL_LISTINGS_API_TOKEN = token;
  let reads = 0;
  const handler = createListResourcesHandler(() => { reads++; throw new Error('should not read'); });
  const denied = await handler(request('/api/portal/listings/resources', null));
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal(reads, 0);
  process.env.PORTAL_LISTINGS_API_TOKEN = 'too-short';
  const unavailable = await handler(request('/api/portal/listings/resources'));
  assert.equal(unavailable.status, 503);
  assert.equal(reads, 0);
  if (old === undefined) delete process.env.PORTAL_LISTINGS_API_TOKEN;
  else process.env.PORTAL_LISTINGS_API_TOKEN = old;
});

test('resource route projects fields, scopes roots, and paginates with stable IDs', async () => {
  const old = process.env.PORTAL_LISTINGS_API_TOKEN;
  process.env.PORTAL_LISTINGS_API_TOKEN = token;
  const rows: FakeRow[] = Array.from({ length: 201 }, (_, index) => ({
    id: `resource-${String(index).padStart(3, '0')}`,
    data: { workspace: LISTINGS_WORKSPACE, projectName: `Business ${index}`, internalNotes: 'private' },
  }));
  rows.push({ id: 'child-001', data: { workspace: LISTINGS_WORKSPACE, parentId: 'resource-001', projectName: 'Should not be a resource' } });
  rows.push({ id: 'wrong-workspace', data: { workspace: 'SEO', projectName: 'Hidden' } });
  const { db, logs } = fakeDatabase(rows);
  const handler = createListResourcesHandler(() => db);
  const first = await handler(request('/api/portal/listings/resources'));
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.resources.length, 199);
  assert.equal(firstBody.resources[198].id, 'resource-198');
  assert.equal(firstBody.nextCursor, 'resource-198');
  assert.deepEqual(Object.keys(firstBody.resources[0]).sort(), ['id', 'name']);
  const second = await handler(request(`/api/portal/listings/resources?cursor=${firstBody.nextCursor}`));
  const secondBody = await second.json();
  assert.deepEqual(secondBody.resources.map((r: { id: string }) => r.id), ['resource-199', 'resource-200']);
  assert.equal(secondBody.nextCursor, null);
  assert.deepEqual(logs[0].selected.sort(), ['companyId', 'parentId', 'projectName', 'workspace']);
  assert.equal(logs[0].filters[0].value, LISTINGS_WORKSPACE);
  assert.equal(logs[0].limit, 201);
  if (old === undefined) delete process.env.PORTAL_LISTINGS_API_TOKEN;
  else process.env.PORTAL_LISTINGS_API_TOKEN = old;
});

test('detail route returns only direct same-workspace, same-company listings with real URLs', async () => {
  const old = process.env.PORTAL_LISTINGS_API_TOKEN;
  process.env.PORTAL_LISTINGS_API_TOKEN = token;
  const rows: FakeRow[] = [
    { id: 'resource-1', data: { workspace: LISTINGS_WORKSPACE, projectName: 'Business', companyId: 'company-1', internalNotes: 'private' } },
    { id: 'child-1', data: { workspace: LISTINGS_WORKSPACE, parentId: 'resource-1', companyId: 'company-1', projectName: 'Google', status: 'Running', url: 'https://google.com/business?listing=abc&place=1', credential: 'private' } },
    { id: 'child-1b', data: { workspace: LISTINGS_WORKSPACE, parentId: 'resource-1', companyId: '', projectName: 'Inherited association', status: 'Setup' } },
    { id: 'child-2', data: { workspace: LISTINGS_WORKSPACE, parentId: 'resource-1', companyId: 'other-company', projectName: 'Wrong company', status: 'Down' } },
    { id: 'child-3', data: { workspace: 'SEO', parentId: 'resource-1', companyId: 'company-1', projectName: 'Wrong workspace', status: 'Down' } },
    { id: 'child-4', data: { workspace: LISTINGS_WORKSPACE, parentId: 'another-resource', companyId: 'company-1', projectName: 'Not direct', status: 'Down' } },
  ];
  const { db, logs } = fakeDatabase(rows);
  const handler = createGetResourceHandler(() => db);
  const response = await handler(request('/api/portal/listings/resources/resource-1'), { params: Promise.resolve({ resourceId: 'resource-1' }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.resource, { id: 'resource-1', name: 'Business', companyId: 'company-1' });
  assert.deepEqual(body.listings, [
    { id: 'child-1', name: 'Google', status: 'active', url: 'https://google.com/business?listing=abc&place=1' },
    { id: 'child-1b', name: 'Inherited association', status: 'pending', url: null },
  ]);
  assert.equal(body.nextCursor, null);
  assert.deepEqual(logs[0].selected.sort(), ['companyId', 'parentId', 'projectName', 'workspace']);
  assert.deepEqual(logs[1].selected.sort(), ['companyId', 'parentId', 'projectName', 'status', 'url', 'workspace']);
  assert.equal(logs[1].filters[0].field, 'parentId');
  assert.equal(logs[1].filters[0].value, 'resource-1');
  assert.equal(logs[1].limit, 201);
  if (old === undefined) delete process.env.PORTAL_LISTINGS_API_TOKEN;
  else process.env.PORTAL_LISTINGS_API_TOKEN = old;
});

test('routes fail honestly when an in-scope public row is malformed', async () => {
  const old = process.env.PORTAL_LISTINGS_API_TOKEN;
  process.env.PORTAL_LISTINGS_API_TOKEN = token;
  const resourceDb = fakeDatabase([{ id: 'resource-1', data: { workspace: LISTINGS_WORKSPACE, projectName: '' } }]).db;
  const resourceResponse = await createListResourcesHandler(() => resourceDb)(request('/api/portal/listings/resources'));
  assert.equal(resourceResponse.status, 500);
  const listingDb = fakeDatabase([
    { id: 'resource-1', data: { workspace: LISTINGS_WORKSPACE, projectName: 'Business' } },
    { id: 'child-1', data: { workspace: LISTINGS_WORKSPACE, parentId: 'resource-1', status: 'Running' } },
  ]).db;
  const listingResponse = await createGetResourceHandler(() => listingDb)(request('/api/portal/listings/resources/resource-1'), { params: Promise.resolve({ resourceId: 'resource-1' }) });
  assert.equal(listingResponse.status, 500);
  if (old === undefined) delete process.env.PORTAL_LISTINGS_API_TOKEN;
  else process.env.PORTAL_LISTINGS_API_TOKEN = old;
});
