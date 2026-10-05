import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createCrmServer } from '../lib/mcp/server';
import { authenticateAgent, checkOrigin, readJson } from '../lib/mcp/access';
import { canManageConnections, escapeNote, groupForStatus, issueToken, MAX_REQUESTS, nextBudget, patchSchema, projectRecord, tokenId } from '../lib/mcp/policy';

test('both admin roles can manage connections; employee roles cannot', () => {
  for (const role of ['master_admin', 'admin']) assert.equal(canManageConnections(role), true);
  for (const role of ['staff', 'freelancer', undefined, 'unknown']) assert.equal(canManageConnections(role), false);
});

test('forged or changed keys fail before any database access', async () => {
  const key = issueToken('test-signing-key');
  assert.equal(tokenId(key.token, 'test-signing-key'), key.id);
  assert.equal(tokenId(key.token, 'other-key'), null);
  assert.equal(tokenId(key.token.replace('awcrm.', 'awcrm.x'), 'test-signing-key'), null);
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'test-signing-key';
  await assert.rejects(authenticateAgent(new Request('https://crm.example/api/mcp', { headers: { Authorization: 'Bearer forged-key' } })), /Invalid MCP key/);
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
});

test('daily cap does not reset on a second connection; resets on a new day', () => {
  const budget = { day: '2026-10-05', requests: MAX_REQUESTS, writes: 25 };
  assert.throws(() => nextBudget(budget, budget.day), /limit reached/);
  assert.throws(() => nextBudget({ ...budget, requests: 0 }, budget.day, true), /limit reached/);
  assert.deepEqual(nextBudget(budget, '2026-10-06'), { day: '2026-10-06', requests: 1, writes: 0 });
});

test('forbidden fields, invalid deadlines and script notes are handled safely', () => {
  for (const patch of [{ role: 'master_admin' }, { companyId: 'other' }, {}, { deadline: '2026-02-30' }, { deadline: '2026-99-99' }]) assert.equal(patchSchema.safeParse(patch).success, false);
  assert.equal(patchSchema.safeParse({ deadline: '2026-10-05' }).success, true);
  assert.equal(escapeNote('<script>alert("x")</script>'), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  assert.deepEqual(projectRecord('companies', 'client', { name: 'Client', seo: true, cardNumber: 'secret', password: 'secret', customSecret: 'secret', seoNotes: 'long' }), { id: 'client', name: 'Client', seo: true });
  assert.equal(groupForStatus('SEO', 'Done', 'custom'), undefined);
  assert.equal(groupForStatus('Local Listings', 'Running'), 'group-running');
  assert.equal(groupForStatus('Local Listings', 'In Progress', 'group-running'), 'group-setup');
});

test('foreign browser origins and oversized bodies are rejected', async () => {
  assert.throws(() => checkOrigin(new Request('https://crm.example/api/mcp', { headers: { Origin: 'https://evil.example' } })), /Origin/);
  await assert.rejects(readJson(new Request('https://crm.example/api/mcp', { method: 'POST', body: 'a'.repeat(32001) })), /too large/);
});

async function connect(canWrite = false, database?: Parameters<typeof createCrmServer>[1]) {
  const server = createCrmServer({ uid: 'admin', name: 'Admin', keyId: 'key', canWrite }, database);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test('real MCP discovery hides the write tool on read-only connections', async () => {
  const { client, close } = await connect();
  try {
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['crm_info', 'list_records', 'get_record']);
    const denied = await client.callTool({ name: 'update_task', arguments: {} });
    assert.equal(denied.isError, true);
    const oversized = await client.callTool({ name: 'list_records', arguments: { collection: 'tickets', limit: 1000 } });
    assert.equal(oversized.isError, true);
    const traversal = await client.callTool({ name: 'get_record', arguments: { collection: 'tickets', id: '../users/admin' } });
    assert.equal(traversal.isError, true);
  } finally { await close(); }
});

test('stateless JSON transport returns an intact response after closing the server', async () => {
  const server = createCrmServer({ uid: 'admin', name: 'Admin', keyId: 'key', canWrite: false });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(new Request('https://crm.example/api/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
  }));
  await server.close();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.serverInfo.name, 'awebco-crm');
});

test('task writes reject stale versions and revoked keys; retries do not duplicate edits', async () => {
  const stored = new Map<string, Record<string, unknown>>([
    ['_mcp/config', { enabled: true }], ['_mcp/key_key', { canWrite: true, uid: 'admin', expiresAt: Date.now() + 100000 }],
    ['users/admin', { role: 'admin' }], ['_mcp/budget', { day: new Date().toISOString().slice(0, 10), requests: 10, writes: 0 }],
    ['tickets/task', { workspace: 'SEO', groupId: 'custom', description: 'Existing' }],
  ]);
  let edits = 0;
  const reference = (path: string) => ({ path, doc: (id: string) => reference(`${path}/${id}`), collection: (id: string) => reference(`${path}/${id}`) });
  const fakeDatabase = {
    collection: (path: string) => reference(path),
    runTransaction: async (run: (transaction: object) => Promise<unknown>) => {
      const pending: (() => void)[] = [];
      const result = await run({
        get: async (ref: { path: string }) => ({ exists: stored.has(ref.path), data: () => stored.get(ref.path), updateTime: { seconds: 10, nanoseconds: 20 } }),
        update: (ref: { path: string }, patch: object) => pending.push(() => { stored.set(ref.path, { ...stored.get(ref.path), ...patch }); if (ref.path === 'tickets/task') edits++; }),
        create: (ref: { path: string }, data: Record<string, unknown>) => pending.push(() => stored.set(ref.path, data)),
      });
      pending.forEach(commit => commit());
      return result;
    },
  };
  const { client, close } = await connect(true, () => fakeDatabase as unknown as ReturnType<NonNullable<Parameters<typeof createCrmServer>[1]>>);
  const args = { id: 'task', expectedVersion: '10:20', operationId: 'de305d54-75b4-431b-adb2-eb6b9e546014', patch: { status: 'Done' } };
  try {
    assert.equal((await client.callTool({ name: 'update_task', arguments: { ...args, expectedVersion: '9:0' } })).isError, true);
    assert.equal(edits, 0);
    assert.notEqual((await client.callTool({ name: 'update_task', arguments: args })).isError, true);
    await client.callTool({ name: 'update_task', arguments: args });
    assert.equal(edits, 1);
    assert.equal(stored.get('tickets/task')!.groupId, 'custom');
    stored.delete('_mcp/key_key');
    assert.equal((await client.callTool({ name: 'update_task', arguments: { ...args, operationId: 'de305d54-75b4-431b-adb2-eb6b9e546015' } })).isError, true);
    assert.equal(edits, 1);
  } finally { await close(); }
});
