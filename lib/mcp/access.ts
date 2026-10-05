import { createHash } from 'node:crypto';
import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '../firebaseAdmin';
import { nextBudget, PRIVATE_COLLECTION, tokenId } from './policy';

export class AccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function mcpDb() {
  const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID;
  if (!databaseId) throw new AccessError('CRM database is not configured.', 503);
  getFirestoreAdmin(); // Reuse existing credentials, but explicitly select the CRM database.
  return getFirestore(getApp(), databaseId);
}

export function signingKey() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!key) throw new AccessError('Server Firebase credentials are not configured.', 503);
  return key.replace(/\\n/g, '\n');
}

export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new AccessError('Origin is not allowed.', 403);
}

export async function masterUser(request: Request) {
  checkOrigin(request);
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!bearer || bearer.length > 8000) throw new AccessError('Sign in to the CRM.', 401);
  const db = mcpDb();
  let uid: string;
  try { uid = (await getAuth(getApp()).verifyIdToken(bearer, true)).uid; }
  catch { throw new AccessError('Sign in to the CRM again.', 401); }
  const profile = (await db.collection('users').doc(uid).get()).data();
  if (profile?.role !== 'master_admin') throw new AccessError('Only the master admin can manage AI connections.', 403);
  return { uid, name: String(profile.name || 'AI agent') };
}

export type McpAccess = { uid: string; name: string; keyId: string; canWrite: boolean };

export async function authenticateAgent(request: Request): Promise<McpAccess> {
  checkOrigin(request);
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') || '')?.[1] || '';
  const id = tokenId(bearer, signingKey());
  if (!id) throw new AccessError('Invalid MCP key.', 401);
  const db = mcpDb();
  // A single shared budget remains effective across serverless instances and all keys.
  const access = await db.runTransaction(async transaction => {
    const config = await transaction.get(db.collection(PRIVATE_COLLECTION).doc('config'));
    if (config.data()?.enabled !== true) throw new AccessError('MCP is disabled. Deploy the security rules and enable it first.', 503);
    const budgetRef = db.collection(PRIVATE_COLLECTION).doc('budget');
    const budget = await transaction.get(budgetRef);
    let reserved;
    try { reserved = nextBudget(budget.data() || {}, new Date().toISOString().slice(0, 10)); }
    catch (error) { throw new AccessError((error as Error).message, 429); }
    const key = (await transaction.get(db.collection(PRIVATE_COLLECTION).doc(`key_${id}`))).data();
    if (!key || key.tokenHash !== hashToken(bearer) || key.expiresAt <= Date.now()) throw new AccessError('MCP key expired or revoked.', 401);
    const user = (await transaction.get(db.collection('users').doc(key.uid))).data();
    if (user?.role !== 'master_admin') throw new AccessError('Connection owner no longer has access.', 403);
    transaction.set(budgetRef, reserved);
    return { uid: key.uid, name: String(user.name || 'AI agent'), keyId: id, canWrite: key.canWrite === true };
  }, { maxAttempts: 3 });
  // Disabling/deleting the owner's Firebase login must also stop their agent keys.
  try {
    if ((await getAuth(getApp()).getUser(access.uid)).disabled) throw new Error('disabled');
  } catch { throw new AccessError('Connection owner no longer has an active login.', 403); }
  return access;
}

export async function readJson(request: Request) {
  if (Number(request.headers.get('content-length')) > 32000) throw new AccessError('Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError('JSON body required.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32000) { await reader.cancel(); throw new AccessError('Request too large.', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AccessError('Invalid JSON.', 400); }
}

export function errorResponse(error: unknown) {
  const status = error instanceof AccessError ? error.status : 503;
  return Response.json({ error: error instanceof AccessError ? error.message : 'MCP unavailable. Check the server configuration.' }, {
    status, headers: { 'Cache-Control': 'no-store', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer realm="awebco-crm"' } : {}) },
  });
}
