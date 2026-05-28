/**
 * scripts/update-companies.mjs
 *
 * Reads phone numbers and domains from Companies_1779981545.xlsx - companies.csv
 * and updates corresponding companies in Firestore.
 *
 * Run with: node scripts/update-companies.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── 1. Load .env manually ───────────────────────────────────────────────────
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
  console.log('✅ Loaded .env file');
} catch (e) {
  console.error('❌ Could not read .env file:', e.message);
  process.exit(1);
}

// ── 2. Firebase Init ─────────────────────────────────────────────────────────
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

// ── Helper: Clean Domain ────────────────────────────────────────────────────
function cleanDomain(raw) {
  if (!raw) return '';
  const parts = raw.split(' - ');
  for (let part of parts) {
    part = part.trim();
    if (part.startsWith('http') || (part.includes('.') && !part.includes(' '))) {
      if (part.startsWith('http')) {
        try {
          const host = new URL(part).hostname;
          return host.replace(/^www\./i, '').toLowerCase();
        } catch (e) {
          // fallback
        }
      }
      return part.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
    }
  }
  return parts[0].replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').trim().toLowerCase();
}

// ── Helper: CSV line parser (respecting quotes) ──────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper: Normalize company names for fuzzy/slug matching
function toSlug(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function run() {
  const csvPath = resolve(__dirname, '..', 'Companies_1779981545.xlsx - companies.csv');
  console.log(`📖 Reading CSV from: ${csvPath}`);
  
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split(/\r?\n/);
  
  // Parse rows
  const csvRecords = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = parseCSVLine(line);
    if (row.length < 15) continue;
    
    const name = row[0];
    const rawDomain = row[11];
    const rawPhone = row[14];
    
    // Skip header lines or sum/stats lines
    if (!name || name === 'Name' || name === 'Leads' || name === 'Companies' || name === 'Design & Print Clients' || name === 'Client Accounts' || name.startsWith(',')) {
      continue;
    }
    
    csvRecords.push({
      name,
      domain: cleanDomain(rawDomain),
      phone: rawPhone ? rawPhone.trim() : ''
    });
  }
  
  console.log(`📊 Found ${csvRecords.length} company records in CSV.`);

  // Fetch all companies from Firestore
  console.log('🔍 Fetching all companies from Firestore...');
  const querySnapshot = await getDocs(collection(db, 'companies'));
  const dbCompanies = querySnapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ref: docSnap.ref,
    data: docSnap.data()
  }));
  console.log(`📄 Found ${dbCompanies.length} companies in Firestore.`);

  // Map database companies for lookup
  const exactLookup = new Map();
  const slugLookup = new Map();
  
  for (const comp of dbCompanies) {
    const name = comp.data.name;
    if (name) {
      exactLookup.set(name.toLowerCase().trim(), comp);
      slugLookup.set(toSlug(name), comp);
    }
  }

  let matchedExact = 0;
  let matchedSlug = 0;
  let notFound = [];
  let updatedCount = 0;

  for (const record of csvRecords) {
    const searchName = record.name.trim();
    let compMatch = exactLookup.get(searchName.toLowerCase());
    
    if (compMatch) {
      matchedExact++;
    } else {
      compMatch = slugLookup.get(toSlug(searchName));
      if (compMatch) {
        matchedSlug++;
      }
    }

    if (!compMatch) {
      notFound.push(record.name);
      continue;
    }

    const dbData = compMatch.data;
    const patch = {};

    // Only update if CSV has a value and it differs from DB
    if (record.domain && record.domain !== dbData.domain) {
      patch.domain = record.domain;
    }
    if (record.phone && record.phone !== dbData.phone) {
      patch.phone = record.phone;
    }

    if (Object.keys(patch).length > 0) {
      console.log(`✏️  Updating "${dbData.name}":`, patch);
      await updateDoc(compMatch.ref, patch);
      updatedCount++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Update Process Complete!`);
  console.log(`   Exact Name Matches:  ${matchedExact}`);
  console.log(`   Slug Name Matches:   ${matchedSlug}`);
  console.log(`   Companies Updated:   ${updatedCount}`);
  console.log(`   Not Found in DB:     ${notFound.length}`);
  console.log('─────────────────────────────────────────');

  if (notFound.length > 0) {
    console.log('\n⚠️ The following CSV companies were not found in the database:');
    notFound.forEach(n => console.log(`   - ${n}`));
  }
  console.log('');
}

run().catch(err => {
  console.error('❌ Update failed:', err);
  process.exit(1);
});
