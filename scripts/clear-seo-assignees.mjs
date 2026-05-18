/**
 * clear-seo-assignees.mjs
 * 
 * Clears the `assignee` and `assignees` fields from ALL tickets in the
 * "SEO" workspace so no user appears as the default assignee.
 *
 * Usage:
 *   node scripts/clear-seo-assignees.mjs
 *
 * You can also target a different workspace by passing it as an argument:
 *   node scripts/clear-seo-assignees.mjs "Support Tickets"
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCpyUfNaKs0dRPZEOciV1GJqJYXh_GruE8',
  authDomain: 'awebco-crm.firebaseapp.com',
  projectId: 'awebco-crm',
  storageBucket: 'awebco-crm.firebasestorage.app',
  messagingSenderId: '574593042513',
  appId: '1:574593042513:web:fada549d2c1f541a5b1070',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Which workspace to clear — default is "SEO", can be overridden by CLI arg
const TARGET_WORKSPACE = process.argv[2] || 'SEO';

async function clearAssignees() {
  console.log(`\n🔍 Fetching all tickets in workspace: "${TARGET_WORKSPACE}"...`);

  const q = query(
    collection(db, 'tickets'),
    where('workspace', '==', TARGET_WORKSPACE)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    console.log(`✅ No tickets found for workspace "${TARGET_WORKSPACE}". Nothing to do.`);
    process.exit(0);
  }

  console.log(`📋 Found ${snap.size} ticket(s). Clearing assignees...`);

  // Firestore batches support max 500 writes each
  const BATCH_SIZE = 499;
  const docs = snap.docs;
  let cleared = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);

    chunk.forEach(d => {
      batch.update(doc(db, 'tickets', d.id), {
        assignee: '',
        assignees: [],
      });
    });

    await batch.commit();
    cleared += chunk.length;
    console.log(`   ✓ Cleared ${cleared}/${docs.length} tickets...`);
  }

  console.log(`\n✅ Done! Cleared assignees from ${cleared} "${TARGET_WORKSPACE}" tickets.\n`);
  process.exit(0);
}

clearAssignees().catch(err => {
  console.error('\n❌ Error running script:', err);
  process.exit(1);
});
