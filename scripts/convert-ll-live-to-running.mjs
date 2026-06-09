/**
 * convert-ll-live-to-running.mjs
 *
 * PURPOSE:
 *   1. Connect to Firestore.
 *   2. Fetch all tickets in "Local Listings" workspace where status is "LIVE" or "Live".
 *   3. Update those statuses to "Running".
 *
 * Run with: node scripts/convert-ll-live-to-running.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

// Load environment variables
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
  }
  console.log('✅ Loaded .env');
} catch (e) {
  console.error('❌ Could not read .env:', e.message);
  process.exit(1);
}

const privateKey   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const clientEmail  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const projectId    = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'awebco-crm';
const databaseId   = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)';

if (!privateKey || !clientEmail) {
  console.error('❌ Google Service Account credentials missing from .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  }),
});

const db = databaseId === '(default)'
  ? admin.firestore()
  : admin.firestore(admin.app(), databaseId);

async function run() {
  console.log('🔍 Querying Local Listings tickets from Firestore...');
  const ticketsSnap = await db.collection('tickets')
    .where('workspace', '==', 'Local Listings')
    .get();

  const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`✅ Loaded ${tickets.length} tickets from Firestore`);

  const liveTickets = tickets.filter(t => t.status === 'LIVE' || t.status === 'Live' || t.status === 'live');
  console.log(`📊 Found ${liveTickets.length} tickets with status 'LIVE'/'Live'`);

  if (liveTickets.length === 0) {
    console.log('🎉 No tickets found with status LIVE/Live. Nothing to update!');
    return;
  }

  console.log('🚀 Updating status to "Running" in Firestore...');
  let updateCount = 0;
  for (const ticket of liveTickets) {
    await db.collection('tickets').doc(ticket.id).update({
      status: 'Running'
    });
    console.log(`   Updated: [${ticket.projectName}] (id: ${ticket.id}) -> status: Running`);
    updateCount++;
  }

  console.log(`\n✅ Successfully updated ${updateCount} tickets to status 'Running'!\n`);
}

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
