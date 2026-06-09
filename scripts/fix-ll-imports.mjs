/**
 * fix-ll-imports.mjs
 *
 * PURPOSE:
 *   1. Find all Local Listings parent tickets that have NO companyId
 *      (old manually/CSV-imported rows that are duplicates of company-linked rows).
 *   2. For each orphaned parent, find the matching company-linked parent row
 *      using fuzzy matching (strips punctuation, case-insensitive).
 *   3. Re-parent any subtasks from the orphaned parent to the company-linked parent.
 *   4. Delete the orphaned parent row.
 *
 * Run with: node scripts/fix-ll-imports.mjs
 * (from the project root, where .env lives)
 *
 * Runs a DRY RUN first, prints the plan, then asks for confirmation.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

// ── 1. Load .env ──────────────────────────────────────────────────────────────
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

// ── 2. Firebase Admin init ────────────────────────────────────────────────────
const privateKey   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const clientEmail  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const projectId    = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'awebco-crm';
const databaseId   = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)';

if (!privateKey || !clientEmail) {
  console.error('❌ Google Service Account keys missing from .env (GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL)');
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

// ── 3. Helpers ────────────────────────────────────────────────────────────────
/**
 * Normalize a string for fuzzy matching:
 *  - lowercase
 *  - remove all punctuation/hyphens/apostrophes
 *  - collapse multiple spaces
 */
function fuzzy(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // replace punctuation with space
    .replace(/\s+/g, ' ')           // collapse spaces
    .trim();
}

async function promptConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── 4. Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log('🔍 Fetching all Local Listings tickets...\n');

  // Fetch all LL tickets
  const ticketsSnap = await db.collection('tickets')
    .where('workspace', '==', 'Local Listings')
    .get();

  const allTickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`   Total LL tickets: ${allTickets.length}`);

  // Fetch all companies
  const companiesSnap = await db.collection('companies').get();
  const companiesById = new Map();
  companiesSnap.docs.forEach(d => companiesById.set(d.id, { id: d.id, ...d.data() }));
  console.log(`   Total companies: ${companiesById.size}\n`);

  // Split into parent rows (no parentId) and subtasks
  const parentRows = allTickets.filter(t => !t.parentId);
  const subTasks   = allTickets.filter(t => !!t.parentId);

  console.log(`   Parent rows:  ${parentRows.length}`);
  console.log(`   Sub-tasks:    ${subTasks.length}\n`);

  // Separate company-linked parents vs. unlinked (old imported) parents
  const linkedParents   = parentRows.filter(t => !!t.companyId);
  const unlinkedParents = parentRows.filter(t => !t.companyId);

  console.log(`   ✅ Company-linked parent rows: ${linkedParents.length}`);
  console.log(`   ⚠️  Unlinked parent rows (to delete): ${unlinkedParents.length}\n`);

  if (unlinkedParents.length === 0) {
    console.log('🎉 Nothing to clean up — no unlinked parent rows found!');
    return;
  }

  // Build lookup using fuzzy matching: fuzzy(name) → linked parent ticket
  // Multiple keys can point to the same ticket (projectName + company.name + companyName field)
  const linkedByFuzzy = new Map();
  for (const lp of linkedParents) {
    const company = lp.companyId ? companiesById.get(lp.companyId) : null;
    if (company?.name) {
      linkedByFuzzy.set(fuzzy(company.name), lp);
    }
    if (lp.companyName) {
      linkedByFuzzy.set(fuzzy(lp.companyName), lp);
    }
    if (lp.projectName) {
      linkedByFuzzy.set(fuzzy(lp.projectName), lp);
    }
  }

  // Plan the operations
  const ops = [];
  for (const orphan of unlinkedParents) {
    const normName = fuzzy(orphan.projectName);
    const match = linkedByFuzzy.get(normName) || null;

    const orphanSubtasks = subTasks.filter(s => s.parentId === orphan.id);
    ops.push({ orphan, match, orphanSubtasks });
  }

  // ── DRY RUN OUTPUT ──────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DRY RUN — Planned Operations:');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let matchCount  = 0;
  let skippedCount = 0;

  for (const { orphan, match, orphanSubtasks } of ops) {
    console.log(`  ❌  DELETE orphan: "${orphan.projectName}" (id: ${orphan.id}, ${orphanSubtasks.length} subtasks)`);
    if (match) {
      matchCount++;
      console.log(`       ✅ → MATCHED: "${match.projectName}" (id: ${match.id}, companyId: ${match.companyId})`);
      if (orphanSubtasks.length > 0) {
        console.log(`          Re-parenting ${orphanSubtasks.length} subtask(s) to this parent.`);
        for (const sub of orphanSubtasks) {
          console.log(`            • "${sub.projectName}"`);
        }
      }
    } else {
      skippedCount++;
      console.log(`       ⚠️  → NO MATCH FOUND — will NOT delete this row.`);
      if (orphanSubtasks.length > 0) {
        console.log(`          ${orphanSubtasks.length} subtasks will remain as-is.`);
      }
    }
    console.log('');
  }

  console.log(`\n  Summary: ${matchCount} will be deleted/merged, ${skippedCount} skipped (no match).`);

  if (matchCount === 0) {
    console.log('\n⚠️  No matches found at all — nothing to do. Check company names in Firestore vs. the orphaned parent names.');
    console.log('   Tip: The fuzzy match strips punctuation. If names still differ, you may need to manually link them.');
    
    // Print all orphan names and all company-linked parent names for comparison
    console.log('\n📋 Orphaned parent names:');
    for (const orphan of unlinkedParents) {
      console.log(`   • "${orphan.projectName}"  [fuzzy: "${fuzzy(orphan.projectName)}"]`);
    }
    console.log('\n📋 Company-linked parent names (first 30):');
    const sample = linkedParents.slice(0, 30);
    for (const lp of sample) {
      const co = lp.companyId ? companiesById.get(lp.companyId) : null;
      console.log(`   • projectName: "${lp.projectName}"  [fuzzy: "${fuzzy(lp.projectName)}"]  company: "${co?.name || 'N/A'}"`);
    }
    return;
  }

  // ── CONFIRMATION ────────────────────────────────────────────────────────────
  const answer = await promptConfirm(
    '\n❓ Proceed? Type "yes" to confirm, anything else to cancel: '
  );

  if (answer !== 'yes') {
    console.log('\n🚫 Cancelled. No changes were made.\n');
    process.exit(0);
  }

  // ── EXECUTE ─────────────────────────────────────────────────────────────────
  console.log('\n🚀 Executing...\n');

  let reparented = 0;
  let deleted = 0;
  let skipped = 0;

  for (const { orphan, match, orphanSubtasks } of ops) {
    if (!match) {
      console.log(`  ⏭️  SKIP: "${orphan.projectName}"`);
      skipped++;
      continue;
    }

    // Re-parent subtasks to the matched linked parent
    for (const sub of orphanSubtasks) {
      await db.collection('tickets').doc(sub.id).update({
        parentId: match.id,
        groupId: match.groupId || sub.groupId,
      });
      console.log(`  ♻️  Re-parented: "${sub.projectName}" → "${match.projectName}"`);
      reparented++;
    }

    // Delete the orphaned parent
    await db.collection('tickets').doc(orphan.id).delete();
    console.log(`  🗑️  Deleted orphaned parent: "${orphan.projectName}" (id: ${orphan.id})`);
    deleted++;
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Done!');
  console.log(`     Orphaned parents deleted:    ${deleted}`);
  console.log(`     Subtasks re-parented:        ${reparented}`);
  console.log(`     Skipped (no match found):    ${skipped}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
