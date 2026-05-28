/**
 * cleanup-db.mjs
 * Removes trailing " Project" from ticket projectName fields
 * and clears the "Automatically created for ... from CRM." default description.
 *
 * Run with: node scripts/cleanup-db.mjs
 * (from the project root, where .env.local lives)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── 1. Load .env.local manually ─────────────────────────────────────────────
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
  console.log('✅ Loaded .env.local');
} catch (e) {
  console.error('❌ Could not read .env.local:', e.message);
  process.exit(1);
}

// ── 2. Firebase init ─────────────────────────────────────────────────────────
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

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

// ── 3. Cleanup logic ─────────────────────────────────────────────────────────
const DEFAULT_DESC_PATTERN = /^Automatically created for .+ from CRM\.$/;

async function runCleanup() {
  console.log('\n🔍 Fetching all tickets from Firestore...\n');

  const snapshot = await getDocs(collection(db, 'tickets'));
  const docs = snapshot.docs;

  console.log(`📄 Found ${docs.length} total tickets\n`);

  let nameFixed   = 0;
  let descFixed   = 0;
  let unchanged   = 0;

  for (const docSnap of docs) {
    const data   = docSnap.data();
    const ref    = doc(db, 'tickets', docSnap.id);
    const patch  = {};

    // Fix: " Project" suffix
    if (typeof data.projectName === 'string' && data.projectName.endsWith(' Project')) {
      const cleaned = data.projectName.slice(0, -' Project'.length).trim();
      patch.projectName = cleaned;
      console.log(`  ✏️  [NAME]  "${data.projectName}"  →  "${cleaned}"`);
      nameFixed++;
    }

    // Fix: default description
    if (
      typeof data.description === 'string' &&
      DEFAULT_DESC_PATTERN.test(data.description.trim())
    ) {
      patch.description = '';
      console.log(`  🧹 [DESC]  Cleared default description on: "${data.projectName || docSnap.id}"`);
      descFixed++;
    }

    if (Object.keys(patch).length > 0) {
      await updateDoc(ref, patch);
    } else {
      unchanged++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Done!`);
  console.log(`   Names fixed:        ${nameFixed}`);
  console.log(`   Descriptions cleared: ${descFixed}`);
  console.log(`   Unchanged:          ${unchanged}`);
  console.log('─────────────────────────────────────────\n');
}

runCleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
