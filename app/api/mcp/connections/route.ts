import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AccessError, errorResponse, hashToken, masterUser, mcpDb, readJson, signingKey } from '@/lib/mcp/access';
import { idSchema, issueToken, PRIVATE_COLLECTION } from '@/lib/mcp/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ name: z.string().trim().min(1).max(60), canWrite: z.boolean().default(false) }).strict();
const reply = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  try {
    await masterUser(request);
    const snapshot = await mcpDb().collection(PRIVATE_COLLECTION).where('type', '==', 'key').limit(10).get();
    return reply({ connections: snapshot.docs.map(doc => { const data = doc.data(); return { id: doc.id.replace('key_', ''), name: data.name, canWrite: data.canWrite, expiresAt: data.expiresAt }; }) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await masterUser(request);
    const input = schema.safeParse(await readJson(request));
    if (!input.success) throw new AccessError('Enter a connection name and access mode.', 400);
    const db = mcpDb();
    const { id, token } = issueToken(signingKey());
    const expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    await db.runTransaction(async transaction => {
      const configRef = db.collection(PRIVATE_COLLECTION).doc('config');
      const config = await transaction.get(configRef);
      if (config.data()?.enabled !== true) throw new AccessError('MCP is disabled. Complete docs/mcp-setup.md first.', 503);
      const connections = await transaction.get(db.collection(PRIVATE_COLLECTION).where('type', '==', 'key').limit(10));
      if (connections.size >= 10) throw new AccessError('Revoke an old connection first (maximum 10).', 409);
      transaction.create(db.collection(PRIVATE_COLLECTION).doc(`key_${id}`), { type: 'key', ...input.data, uid: user.uid, tokenHash: hashToken(token), expiresAt, createdAt: FieldValue.serverTimestamp() });
      // Serialize key creation through the config document to enforce the cap.
      transaction.update(configRef, { updatedAt: FieldValue.serverTimestamp() });
    });
    return reply({ id, token, expiresAt });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    await masterUser(request);
    const parsed = idSchema.safeParse(new URL(request.url).searchParams.get('id'));
    if (!parsed.success) throw new AccessError('Invalid connection ID.', 400);
    await mcpDb().collection(PRIVATE_COLLECTION).doc(`key_${parsed.data}`).delete();
    return reply({ revoked: true });
  } catch (error) { return errorResponse(error); }
}
