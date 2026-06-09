/**
 * fill-ll-passwords.mjs
 *
 * PURPOSE:
 *   1. Load the Local Listings CSV file.
 *   2. Parse parent rows and their corresponding citation subitems (Username, Password).
 *   3. Connect to Firestore.
 *   4. Find matching parent tickets and subtasks for "Local Listings".
 *   5. Populate the `username` and `password` fields on the subtasks in Firestore.
 *
 * Run with: node scripts/fill-ll-passwords.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const csvPath = resolve(__dirname, '..', 'Local_Listings_1781010711.xlsx - local listings.csv');

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
  console.log('✅ Loaded .env');
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

// ── 3. Parse CSV ──────────────────────────────────────────────────────────────
console.log('📄 Reading CSV file...');
let csvContent;
try {
  csvContent = readFileSync(csvPath, 'utf-8');
} catch (e) {
  console.error('❌ Could not read CSV file:', e.message);
  process.exit(1);
}

const lines = Papa.parse(csvContent, { header: false }).data;
console.log(`✅ Loaded ${lines.length} lines from CSV`);

let currentParentName = null;
const parsedCsvData = {}; // parentName (normalized) -> array of { name, username, password }

for (const row of lines) {
  if (!row || row.length < 2) continue;
  
  const col0 = (row[0] || '').trim();
  const col1 = (row[1] || '').trim();
  
  if (col0 && col0 !== 'Subitems' && col0 !== 'Name' && col0 !== 'Local Listings') {
    // This is a parent row!
    currentParentName = col0;
    parsedCsvData[currentParentName] = [];
  } else if (!col0 && col1 && col1 !== 'Name') {
    // This is a subitem row under the current parent!
    if (currentParentName) {
      const subitemName = col1;
      const username = (row[5] || '').trim();
      const password = (row[6] || '').trim();
      
      parsedCsvData[currentParentName].push({
        name: subitemName,
        username,
        password
      });
    }
  }
}

const csvParentNames = Object.keys(parsedCsvData);
console.log(`✅ Parsed ${csvParentNames.length} parents with subitems from CSV`);

// ── 4. Normalize Helper ───────────────────────────────────────────────────────
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ── 5. Main Execution ─────────────────────────────────────────────────────────
async function run() {
  console.log('🔍 Querying Local Listings tickets from Firestore...');
  const ticketsSnap = await db.collection('tickets')
    .where('workspace', '==', 'Local Listings')
    .get();

  const allTickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`✅ Fetched ${allTickets.length} tickets from Firestore`);

  const parentTickets = allTickets.filter(t => !t.parentId);
  const subtasks = allTickets.filter(t => !!t.parentId);
  console.log(`   Parents: ${parentTickets.length}, Subtasks: ${subtasks.length}`);

  // Map parent tickets by normalized projectName
  const parentMap = new Map();
  parentTickets.forEach(t => {
    parentMap.set(normalize(t.projectName), t);
  });

  let matchParentCount = 0;
  let matchSubtaskCount = 0;
  let updatedSubtaskCount = 0;
  const updatesBatch = [];

  for (const csvParentName of csvParentNames) {
    const normParent = normalize(csvParentName);
    const parentTicket = parentMap.get(normParent);

    if (!parentTicket) {
      console.log(`⚠️  No matching Firestore parent found for CSV: "${csvParentName}"`);
      continue;
    }

    matchParentCount++;
    const csvSubitems = parsedCsvData[csvParentName];
    const parentSubtasks = subtasks.filter(s => s.parentId === parentTicket.id);

    // Map parent subtasks by normalized projectName
    const subtaskMap = new Map();
    parentSubtasks.forEach(s => {
      subtaskMap.set(normalize(s.projectName), s);
    });

    for (const csvSubitem of csvSubitems) {
      const normSub = normalize(csvSubitem.name);
      const subtaskTicket = subtaskMap.get(normSub);

      if (!subtaskTicket) {
        // Occasionally, names might differ slightly (e.g. including .com or not).
        // Let's do a fallback fuzzy check where one name contains the other.
        const fuzzyMatch = parentSubtasks.find(s => {
          const normS = normalize(s.projectName);
          return normS.includes(normSub) || normSub.includes(normS);
        });

        if (fuzzyMatch) {
          subtaskMap.set(normSub, fuzzyMatch);
        } else {
          continue;
        }
      }

      const matchedSubtask = subtaskMap.get(normSub);
      matchSubtaskCount++;

      // Check if fields actually need updating
      const needsUserUpdate = csvSubitem.username && matchedSubtask.username !== csvSubitem.username;
      const needsPassUpdate = csvSubitem.password && matchedSubtask.password !== csvSubitem.password;

      if (needsUserUpdate || needsPassUpdate) {
        const patch = {};
        if (needsUserUpdate) patch.username = csvSubitem.username;
        if (needsPassUpdate) patch.password = csvSubitem.password;

        updatesBatch.push({
          id: matchedSubtask.id,
          projectName: matchedSubtask.projectName,
          parentName: parentTicket.projectName,
          patch
        });
      }
    }
  }

  console.log(`\n📊 Match Summary:`);
  console.log(`   Parents matched:  ${matchParentCount} / ${csvParentNames.length}`);
  console.log(`   Subtasks matched: ${matchSubtaskCount}`);
  console.log(`   Updates needed:   ${updatesBatch.length}\n`);

  if (updatesBatch.length === 0) {
    console.log('🎉 Database is already up to date! No updates needed.');
    return;
  }

  console.log('🚀 Writing updates to Firestore...');
  for (const update of updatesBatch) {
    await db.collection('tickets').doc(update.id).update(update.patch);
    console.log(`   Updated: [${update.parentName}] -> [${update.projectName}] with username/password`);
    updatedSubtaskCount++;
  }

  console.log(`\n✅ Finished updating ${updatedSubtaskCount} subtasks in Firestore!\n`);
}

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
