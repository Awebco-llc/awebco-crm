import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

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
} catch (e) {
  console.error('❌ Could not read .env file:', e.message);
  process.exit(1);
}

const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'awebco-crm';

if (privateKey && clientEmail) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
} else {
  console.error('❌ Google Service Account keys missing from env');
  process.exit(1);
}

const db = admin.firestore();

// Exact or keyword mappings for all 105 companies
const OVERRIDES = {
  // Non-Profit & Community
  "Operation Honor Guard": "Non-Profit & Community",
  "Arts in the Park": "Non-Profit & Community",
  "Hope Springs Safe House": "Non-Profit & Community",
  "Boys & Girls Club": "Non-Profit & Community",
  "Community Action Program of Western Indiana": "Non-Profit & Community",
  "Vermilion Advantage": "Non-Profit & Community",
  "Danville Family YMCA": "Non-Profit & Community",
  "Cancer Care Bags": "Non-Profit & Community",
  "Danville Farmers Market": "Non-Profit & Community",
  "ECI Work Net": "Non-Profit & Community",

  // Government, Public Entities & Education
  "Central Illinois Land Bank": "Government & Education",
  "Town of Veedersburg": "Government & Education",
  "Village of Tilton": "Government & Education",
  "City of Attica": "Government & Education",
  "Vermilion County Conservation District": "Government & Education",
  "Danville Public School District": "Government & Education",
  "Vermilion County Works": "Government & Education",
  "Centralia Carillon Bell Tower Park": "Government & Education",
  "Danville Area Visitors Bureau": "Government & Education",

  // Finance, Banking & Insurance
  "Ross Webb State Farm": "Finance & Insurance",
  "Centrebank": "Finance & Insurance",
  "Tee Pak Credit Union": "Finance & Insurance",
  "Consolidated Contractors Safety Fund of Illinois": "Finance & Insurance",
  "CCMSI": "Finance & Insurance",

  // Healthcare & Senior Care
  "Autumn Fields Savoy": "Healthcare & Senior Care",
  "Hand in Hand Hospice Care": "Healthcare & Senior Care",
  "Pacific Angels Home Care": "Healthcare & Senior Care",

  // Construction, Paving & Excavation
  "Reffett Construction": "Construction & Contracting",
  "Taggart Construction": "Construction & Contracting",
  "Donovan Construction LLC": "Construction & Contracting",
  "Cook Homes TN": "Construction & Contracting",
  "Quick Pools & Patten Earthmoving": "Construction & Contracting",
  "Elite Earthworks": "Construction & Contracting",
  "Boyds Asphalt": "Construction & Contracting",
  "Midwest Asphalt CO.": "Construction & Contracting",

  // Real Estate & Property Management
  "Silver Acres Apartments": "Real Estate",
  "Ethical Real Estate Professional": "Real Estate",
  "Eddie G Real Estate": "Real Estate",
  "Zindars Property Management": "Real Estate",
  "Vermilion Housing": "Real Estate",

  // Manufacturing & Industrial
  "Rivertown Machining": "Manufacturing & Industrial",
  "GPI Plastics": "Manufacturing & Industrial",
  "Viscofan": "Manufacturing & Industrial",
  "Trigard Memorials": "Manufacturing & Industrial",
  "Trigard": "Manufacturing & Industrial",
  "Hall of Fame Plaques & Signs": "Manufacturing & Industrial",
  "Sabre Bats": "Manufacturing & Industrial",

  // Food Service & Restaurants
  "Lees Famous Recipe Chicken": "Restaurant & Food Service",
  "Stonies Taphouse & Bistro": "Restaurant & Food Service",
  "Jockos": "Restaurant & Food Service",
  "Maru's Kitchen": "Restaurant & Food Service",
  "Shark Grill": "Restaurant & Food Service",

  // Retail, E-Commerce & Specialty Shops
  "Boswell Trade Center": "Retail & E-commerce",
  "Charlottes": "Retail & E-commerce",
  "2A Gun Works": "Retail & E-commerce",
  "Danville Flooring Warehouse": "Retail & E-commerce",
  "Enygma Supps": "Retail & E-commerce",
  "Clodius & Company": "Retail & E-commerce",

  // Professional, Legal & Business Services
  "Alexis Serrano": "Professional Services",
  "Monyok Leadership": "Professional Services",
  "Mike Van De Walker": "Professional Services",
  "Patten Services, LLC.": "Professional Services",
  "Lawlyes Law Firm": "Professional Services",
  "Tuggle Law": "Professional Services",
  "Paradigm 1": "Professional Services",
  "Camino Del Sol Funeral Chapel": "Professional Services",
  "Sunset Funeral Home": "Professional Services",

  // Home Services & Maintenance
  "The Plumber": "Home Services & Maintenance",
  "Ridge Plumbing": "Home Services & Maintenance",
  "Crose Plumbing & Heating": "Home Services & Maintenance",
  "Byerly Garage Doors": "Home Services & Maintenance",
  "Champaign Danville Overhead Doors": "Home Services & Maintenance",
  "Clawson's Furnace & Air Conditioning": "Home Services & Maintenance",
  "Alvarez Industrial Cleaning": "Home Services & Maintenance",
  "Abfacilityservice": "Home Services & Maintenance",
  "D&D Trash Service": "Home Services & Maintenance",
  "Sentry Roofing": "Home Services & Maintenance",
  "Atlas Total Home": "Home Services & Maintenance",
  "Icon Glass Monterey": "Home Services & Maintenance",
  "Harper Well Drilling": "Home Services & Maintenance",

  // Technology, IT & Marketing
  "Core 6 Marketing": "Technology & Marketing",
  "Nct-us": "Technology & Marketing",
  "Awebco": "Technology & Marketing",
  "DTI Solutions": "Technology & Marketing",
  "Rahmtech": "Technology & Marketing",
  "ProTech": "Technology & Marketing",
  "Rare Pills": "Technology & Marketing",
  "ASAP Signs": "Technology & Marketing",

  // Transportation, Logistics & Delivery
  "Dawson Logistics": "Transportation & Logistics",
  "Overflow Market Delivery": "Transportation & Logistics",
  "Crom Bus": "Transportation & Logistics",
  "Vermilion Regional Airport": "Transportation & Logistics",

  // Entertainment, Recreation & Tourism
  "Requite Tattoo, LLC": "Entertainment & Recreation",
  "Palmer Arena": "Entertainment & Recreation",
  "Revive Salon & Spa": "Entertainment & Recreation",
  "West Coast Adventure Riders": "Entertainment & Recreation",
  "Sail Monterey": "Entertainment & Recreation",
  "Carlas 777": "Entertainment & Recreation",
  "Gloomer Entertainment": "Entertainment & Recreation",

  // Agriculture
  "Franklin's Farm Blooms & Heirlooms": "Agriculture",
  "Ohl Family Farms": "Agriculture",
};

// Simple rule classifier based on name keywords as a fallback
function classifyByName(name) {
  const n = name.toLowerCase();
  
  if (OVERRIDES[name]) {
    return OVERRIDES[name];
  }
  
  // Try keyword matches
  if (n.includes('plumb')) return "Home Services & Maintenance";
  if (n.includes('paint') || n.includes('coat')) return "Painting & Coating";
  if (n.includes('roof')) return "Home Services & Maintenance";
  if (n.includes('clean') || n.includes('facility')) return "Home Services & Maintenance";
  if (n.includes('construct') || n.includes('contract') || n.includes('earth') || n.includes('paving') || n.includes('asphalt')) return "Construction & Contracting";
  if (n.includes('school') || n.includes('district') || n.includes('univ') || n.includes('college')) return "Government & Education";
  if (n.includes('church') || n.includes('christian') || n.includes('ministry')) return "Religious & Non-Profit";
  if (n.includes('real estate') || n.includes('realt') || n.includes('properties') || n.includes('apartment') || n.includes('housing')) return "Real Estate";
  if (n.includes('bank') || n.includes('credit') || n.includes('insurance') || n.includes('financial')) return "Finance & Insurance";
  if (n.includes('hospital') || n.includes('care') || n.includes('hospice') || n.includes('clinic')) return "Healthcare & Senior Care";
  if (n.includes('restaurant') || n.includes('kitchen') || n.includes('pizza') || n.includes('chicken') || n.includes('grill') || n.includes('bistro') || n.includes('taphouse')) return "Restaurant & Food Service";
  if (n.includes('marketing') || n.includes('tech') || n.includes('software') || n.includes('digital')) return "Technology & Marketing";
  if (n.includes('logistics') || n.includes('delivery') || n.includes('airport') || n.includes('trans')) return "Transportation & Logistics";
  if (n.includes('salon') || n.includes('spa') || n.includes('recreation') || n.includes('arena') || n.includes('entertainment') || n.includes('adventure')) return "Entertainment & Recreation";
  
  return "General Business";
}

async function run() {
  const args = process.argv.slice(2);
  const isWriteMode = args.includes('--write');

  console.log(`🔍 Fetching companies from Firestore...`);
  const snapshot = await db.collection('companies').get();
  console.log(`📄 Found ${snapshot.size} companies.`);

  let updatedCount = 0;
  let matchesCount = 0;
  
  const results = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const name = data.name || '';
    const currentIndustry = data.industry || '';
    
    const targetIndustry = classifyByName(name);
    
    results.push({
      id: docSnap.id,
      name,
      currentIndustry,
      targetIndustry
    });

    if (currentIndustry !== targetIndustry) {
      if (isWriteMode) {
        await db.collection('companies').doc(docSnap.id).update({
          industry: targetIndustry
        });
        updatedCount++;
      } else {
        matchesCount++;
      }
    }
  }

  // Print results summary grouped by Industry
  const groups = {};
  for (const res of results) {
    if (!groups[res.targetIndustry]) {
      groups[res.targetIndustry] = [];
    }
    groups[res.targetIndustry].push(res);
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log(`📊 Classification Results Preview:`);
  console.log('──────────────────────────────────────────────────');
  
  for (const [ind, items] of Object.entries(groups)) {
    console.log(`\n📂 [${ind}] (${items.length} companies)`);
    for (const item of items) {
      const diffIndicator = item.currentIndustry === item.targetIndustry 
        ? '   ' 
        : '✏️ ';
      console.log(`  ${diffIndicator}${item.name} (${item.currentIndustry || 'None'} → ${item.targetIndustry})`);
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  if (isWriteMode) {
    console.log(`✅ Successfully updated ${updatedCount} companies in Firestore!`);
  } else {
    console.log(`💡 DRY RUN ONLY. Run with '--write' flag to apply updates to database.`);
    console.log(`   Pending updates: ${matchesCount} / ${snapshot.size} companies.`);
  }
  console.log('──────────────────────────────────────────────────\n');
}

run().catch(err => {
  console.error('❌ Error executing script:', err);
  process.exit(1);
});
