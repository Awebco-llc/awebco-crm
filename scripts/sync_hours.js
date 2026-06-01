const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, query, where } = require('firebase/firestore');

// Helper to parse date value (copied from lib/importer.ts)
function parseDateValue(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (!str || str === '-') return '';

  const num = Number(str);
  if (!Number.isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return str;
}

function isNextRowHeader(rows, startIndex) {
  for (let i = startIndex; i < rows.length; i++) {
    const nextRow = rows[i].map(c => (c === undefined || c === null) ? '' : String(c).trim());
    if (nextRow.every(c => c === '')) continue;
    
    const isHeader = nextRow.some(cell => cell.toLowerCase() === 'name') && 
                     nextRow.some(cell => cell.toLowerCase() === 'status') && 
                     nextRow.some(cell => ['person', 'owner', 'assignee', 'people'].includes(cell.toLowerCase()));
    
    return isHeader;
  }
  return false;
}

// Copy of parseHierarchicalCSV modified for JS
function parseHierarchicalCSV(rows) {
  const results = [];
  
  let currentGroup = '';
  let currentParentName = '';
  
  let mainHeaders = null;
  let subitemHeaders = null;
  let isParsingSubitems = false;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex].map(c => (c === undefined || c === null) ? '' : String(c).trim());
    
    if (row.every(c => c === '')) continue;

    if (row[0].toLowerCase() === 'support tickets' && row.slice(1).every(c => c === '')) {
      continue;
    }

    const isHeader = row.some(cell => cell.toLowerCase() === 'name') && 
                     row.some(cell => cell.toLowerCase() === 'status') && 
                     row.some(cell => ['person', 'owner', 'assignee', 'people'].includes(cell.toLowerCase()));
    
    if (isHeader) {
      if (row[0].toLowerCase() === 'subitems') {
        subitemHeaders = row;
        isParsingSubitems = true;
      } else {
        mainHeaders = row;
        isParsingSubitems = false;
      }
      continue;
    }

    if (row[0].toLowerCase() === 'subitems') {
      subitemHeaders = row;
      isParsingSubitems = true;
      continue;
    }

    const isGroupHeader = row[0] !== '' && 
                          row.slice(1).every(c => c === '') && 
                          !['name', 'subitems', 'status', 'person', 'owner', 'assignee', 'people', 'date', 'description', 'link'].includes(row[0].toLowerCase()) &&
                          isNextRowHeader(rows, rowIndex + 1);
    
    if (isGroupHeader) {
      currentGroup = row[0];
      currentParentName = '';
      continue;
    }

    if (isParsingSubitems) {
      const nameIdx = subitemHeaders?.findIndex(h => h.toLowerCase() === 'name') ?? 1;
      const ownerIdx = subitemHeaders?.findIndex(h => ['owner', 'person', 'assignee', 'people'].includes(h.toLowerCase())) ?? 2;
      const statusIdx = subitemHeaders?.findIndex(h => h.toLowerCase() === 'status') ?? 3;
      const dateIdx = subitemHeaders?.findIndex(h => ['date', 'deadline', 'due date'].includes(h.toLowerCase())) ?? 4;
      const docIdx = subitemHeaders?.findIndex(h => h.toLowerCase().includes('doc')) ?? 5;
      const linkIdx = subitemHeaders?.findIndex(h => h.toLowerCase() === 'link') ?? 6;
      const notesIdx = subitemHeaders?.findIndex(h => ['notes', 'description'].includes(h.toLowerCase())) ?? 7;
      const billableHoursIdx = subitemHeaders?.findIndex(h => h.toLowerCase().includes('billable') || h.toLowerCase().includes('hours')) ?? -1;

      const subName = row[nameIdx] || '';
      
      if (!subName) {
        if (row[0] !== '') {
          isParsingSubitems = false;
        } else {
          continue;
        }
      } else {
        results.push({
          projectName: subName,
          description: row[notesIdx] || '',
          status: row[statusIdx] || 'Not Started',
          priority: 'Medium',
          assigneeName: row[ownerIdx] || '',
          companyName: '',
          deadline: parseDateValue(row[dateIdx]),
          url: row[linkIdx] || row[docIdx] || '',
          billableHours: billableHoursIdx !== -1 ? row[billableHoursIdx] : '',
          groupName: currentGroup,
          isSubRow: true,
          parentName: currentParentName
        });
        continue;
      }
    }

    if (mainHeaders) {
      const nameIdx = mainHeaders.findIndex(h => h.toLowerCase() === 'name') ?? 0;
      const personIdx = mainHeaders.findIndex(h => ['person', 'owner', 'assignee', 'people'].includes(h.toLowerCase())) ?? 2;
      const statusIdx = mainHeaders.findIndex(h => h.toLowerCase() === 'status') ?? 3;
      const dateIdx = mainHeaders.findIndex(h => ['date', 'deadline', 'due date'].includes(h.toLowerCase())) ?? 4;
      const descIdx = mainHeaders.findIndex(h => ['description', 'notes'].includes(h.toLowerCase())) ?? 5;
      const linkIdx = mainHeaders.findIndex(h => h.toLowerCase() === 'link') ?? 6;
      const billableHoursIdx = mainHeaders.findIndex(h => h.toLowerCase().includes('billable') || h.toLowerCase().includes('hours')) ?? -1;

      const pName = row[nameIdx] || '';
      if (pName) {
        currentParentName = pName;
        results.push({
          projectName: pName,
          description: row[descIdx] || '',
          status: row[statusIdx] || 'Not Started',
          priority: 'Medium',
          assigneeName: row[personIdx] || '',
          companyName: '',
          deadline: parseDateValue(row[dateIdx]),
          url: row[linkIdx] || '',
          billableHours: billableHoursIdx !== -1 ? row[billableHoursIdx] : '',
          groupName: currentGroup,
          isSubRow: false
        });
      }
    } else {
      const pName = row[0] || '';
      if (pName) {
        currentParentName = pName;
        results.push({
          projectName: pName,
          description: row[5] || '',
          status: row[3] || 'Not Started',
          priority: 'Medium',
          assigneeName: row[2] || '',
          companyName: '',
          deadline: parseDateValue(row[4]),
          url: row[6] || '',
          billableHours: row[8] || '',
          groupName: currentGroup,
          isSubRow: false
        });
      }
    }
  }

  return results;
}

// Load env vars
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found!');
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    // remove quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  });
  return env;
}

async function run() {
  console.log('--- Loading Environment ---');
  const env = loadEnv();
  
  const firebaseConfig = {
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
  
  const databaseId = env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)';
  
  console.log(`Configuring Firebase for project: ${firebaseConfig.projectId}, Database ID: ${databaseId}`);
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, databaseId);

  console.log('\n--- Reading and Parsing CSV ---');
  const csvPath = path.join(__dirname, '..', 'Support_Tickets_1780325330.xlsx - support tickets.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  
  const parseResult = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
  });
  
  const rows = parseResult.data;
  const parsedTickets = parseHierarchicalCSV(rows);
  console.log(`Parsed ${parsedTickets.length} tickets from the CSV.`);

  console.log('\n--- Fetching Existing Firestore Tickets ---');
  const ticketsQuery = query(collection(db, 'tickets'), where('workspace', '==', 'Support Tickets'));
  const querySnap = await getDocs(ticketsQuery);
  const firestoreTickets = [];
  querySnap.forEach(docSnap => {
    firestoreTickets.push({ id: docSnap.id, ...docSnap.data() });
  });
  console.log(`Found ${firestoreTickets.length} tickets in Firestore under 'Support Tickets'.`);

  console.log('\n--- Syncing Billable Hours ---');
  let matchedCount = 0;
  let updatedCount = 0;

  for (const csvItem of parsedTickets) {
    const billableVal = String(csvItem.billableHours || '').trim();
    if (!billableVal) continue; // Skip if CSV has no billable hours specified

    // Find matches in Firestore
    // Match by projectName (case-insensitive)
    let match = null;
    if (csvItem.isSubRow) {
      // For subtasks, look for matches by name, parentId and whether parent name matches
      const possibleMatches = firestoreTickets.filter(t => t.projectName.toLowerCase() === csvItem.projectName.toLowerCase() && t.parentId);
      for (const t of possibleMatches) {
        const parent = firestoreTickets.find(p => p.id === t.parentId);
        if (parent && parent.projectName.toLowerCase() === csvItem.parentName.toLowerCase()) {
          match = t;
          break;
        }
      }
    } else {
      match = firestoreTickets.find(t => t.projectName.toLowerCase() === csvItem.projectName.toLowerCase() && !t.parentId);
    }

    if (match) {
      matchedCount++;
      const currentHours = String(match.billableHours || '').trim();
      if (currentHours !== billableVal) {
        console.log(`Updating [${match.projectName}] billable hours: '${currentHours}' -> '${billableVal}'`);
        await updateDoc(doc(db, 'tickets', match.id), {
          billableHours: billableVal,
          updatedAt: new Date()
        });
        updatedCount++;
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Matched tickets: ${matchedCount}`);
  console.log(`Updated tickets: ${updatedCount}`);
  console.log('Sync complete!');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
