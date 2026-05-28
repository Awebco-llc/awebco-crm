/**
 * unassign-all.mjs
 *
 * Clears assignees from EVERY record across all collections:
 *   - tickets    → assignee: '', assignees: []
 *   - contacts   → assignedToId: ''
 *   - companies  → assignedToId: ''
 *   - deals      → assignedToId: ''
 *
 * Usage:
 *   node scripts/unassign-all.mjs
 *
 * Optional — only clear a specific collection:
 *   node scripts/unassign-all.mjs tickets
 *   node scripts/unassign-all.mjs contacts
 *   node scripts/unassign-all.mjs companies
 *   node scripts/unassign-all.mjs deals
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env ─────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

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
  console.log('✅ Loaded .env\n');
} catch (e) {
  console.error('❌ Could not read .env:', e.message);
  process.exit(1);
}

// ── Firebase init ─────────────────────────────────────────────────────────────
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)';
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app, databaseId);

const BATCH_SIZE = 499;

async function clearCollection(collectionName, buildPatch) {
  console.log(`🔍 Fetching "${collectionName}"...`);
  const snap = await getDocs(collection(db, collectionName));

  if (snap.empty) {
    console.log(`   ⚪ No documents found.\n`);
    return 0;
  }

  const docs = snap.docs;
  let cleared = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    chunk.forEach(d => batch.update(doc(db, collectionName, d.id), buildPatch(d.data())));
    await batch.commit();
    cleared += chunk.length;
  }

  console.log(`   ✅ Cleared ${cleared} records in "${collectionName}"\n`);
  return cleared;
}

async function run() {
  const target = process.argv[2]?.toLowerCase();

  const tasks = {
    tickets:   () => clearCollection('tickets',   () => ({ assignee: '', assignees: [] })),
    contacts:  () => clearCollection('contacts',  () => ({ assignedToId: '' })),
    companies: () => clearCollection('companies', () => ({ assignedToId: '' })),
    deals:     () => clearCollection('deals',     () => ({ assignedToId: '' })),
  };

  if (target) {
    if (!tasks[target]) {
      console.error(`❌ Unknown collection "${target}". Choose: tickets, contacts, companies, deals`);
      process.exit(1);
    }
    console.log(`\n🎯 Targeting only: "${target}"\n`);
    await tasks[target]();
  } else {
    console.log('🧹 Unassigning everyone from everything...\n');
    for (const [name, fn] of Object.entries(tasks)) {
      await fn();
    }
  }

  console.log('─────────────────────────────────────────');
  console.log('✅ All done! Everyone has been unassigned.');
  console.log('─────────────────────────────────────────\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
