import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Company, Contact, TeamMember, Status, Ticket, Deal } from '@/components/Shared';
import { createCompany, createContact, createTicket, createGroup, createDeal } from '@/lib/crmStore';

export interface ImportResult {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  title: string;
  assignedToName: string;
}

export interface DealImportResult {
  name: string;
  currentStep: string;
  status: string;
  ownerName: string;
  dealValue: string;
  contactName: string;
  companyName: string;
  notes: string;
  lastInteraction: string;
  expectedCloseDate: string;
  closeProbability: string;
  forecastValue: string;
  section: string; // Active Deals, Closed / Won, Lost, 2025, etc.
}

export interface TicketImportResult {
  projectName: string;
  description: string;
  status: string;
  priority: string;
  assigneeName: string;
  companyName: string;
  deadline: string;
  url: string;
  groupName?: string;
  isSubRow?: boolean;
  parentName?: string;
  billableHours?: string;
}

function parseDateValue(val: any): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str || str === '-') return '';

  // 1. Check if it's a numeric Excel serial number
  const num = Number(str);
  if (!Number.isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. Check if it is already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 3. Try parsing with standard Date
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return str;
}

function isNextRowHeader(rows: string[][], startIndex: number): boolean {
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

export function parseHierarchicalCSV(rows: string[][]): TicketImportResult[] {
  const results: TicketImportResult[] = [];
  
  let currentGroup = '';
  let currentParentName = '';
  
  let mainHeaders: string[] | null = null;
  let subitemHeaders: string[] | null = null;
  let isParsingSubitems = false;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex].map(c => (c === undefined || c === null) ? '' : String(c).trim());
    
    // Skip completely empty rows
    if (row.every(c => c === '')) continue;

    // Skip the Workspace/Type header e.g., "SEO,,,,,,,"
    if (row[0].toLowerCase() === 'seo' && row.slice(1).every(c => c === '')) {
      continue;
    }

    // Check if it is a main or subitem header row
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

    // Check if it is a Group Name header (e.g., Awebco, Sentry Roofing)
    // Only a group header if it is followed by a header row!
    const isGroupHeader = row[0] !== '' && 
                          row.slice(1).every(c => c === '') && 
                          !['name', 'subitems', 'status', 'person', 'owner', 'assignee', 'people', 'date', 'description', 'link'].includes(row[0].toLowerCase()) &&
                          isNextRowHeader(rows, rowIndex + 1);
    
    if (isGroupHeader) {
      currentGroup = row[0];
      currentParentName = '';
      continue;
    }

    // Parse data rows
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
          // Fall through to parse as main row
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

    // Parse as main row
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

export async function parseFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          
          const isHierarchical = rows.some(row =>
            row.some(cell => typeof cell === 'string' && cell.toLowerCase() === 'subitems')
          );

          if (isHierarchical) {
            resolve(parseHierarchicalCSV(rows));
            return;
          }

          const headerIndex = findHeaderRow(rows);
          if (headerIndex === -1) {
            resolve([]);
            return;
          }

          const headers = rows[headerIndex];
          const dataRows = rows.slice(headerIndex + 1);

          const mappedData = dataRows.map(row => {
            const obj: any = {};
            headers.forEach((h, i) => {
              if (h) obj[h.trim()] = row[i];
            });
            return obj;
          });

          resolve(mappedData);
        },
        error: (err) => reject(err)
      });
    } else {
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

        const isHierarchical = rows.some(row =>
          row.some(cell => typeof cell === 'string' && cell.toLowerCase() === 'subitems')
        );

        if (isHierarchical) {
          resolve(parseHierarchicalCSV(rows));
          return;
        }

        const headerIndex = findHeaderRow(rows);
        if (headerIndex === -1) {
          resolve([]);
          return;
        }

        const headers = rows[headerIndex];
        const dataRows = rows.slice(headerIndex + 1);

        const mappedData = dataRows.map(row => {
          const obj: any = {};
          headers.forEach((h, i) => {
            if (h) obj[h.trim()] = row[i];
          });
          return obj;
        });

        resolve(mappedData);
      };
      reader.readAsBinaryString(file);
    }
  });
}

function findHeaderRow(rows: string[][]): number {
  return rows.findIndex(row =>
    row.some(cell => typeof cell === 'string' && (
      cell.toLowerCase().includes('email') ||
      cell.toLowerCase().includes('first name') ||
      cell.toLowerCase().includes('last name') ||
      cell.toLowerCase().includes('subject') ||
      cell.toLowerCase().includes('project name')
    ))
  );
}

export function mapImportData(rawData: any[]): ImportResult[] {
  return rawData.map(row => ({
    firstName: row['First Name'] || row['firstname'] || '',
    lastName: row['Last Name'] || row['lastname'] || '',
    email: row['Email'] || row['email'] || '',
    phone: row['Phone'] || row['phone'] || row['Cell Phone'] || '',
    companyName: row['Accounts'] || row['Company'] || row['company'] || '',
    title: row['Title'] || row['title'] || '',
    assignedToName: row['People'] || row['Assigned To'] || '',
  })).filter(item => item.firstName || item.lastName || item.email);
}

export function mapTicketImportData(rawData: any[]): TicketImportResult[] {
  if (rawData.length > 0 && rawData[0].projectName !== undefined) {
    return rawData as TicketImportResult[];
  }
  
  return rawData.map(row => ({
    projectName: row['Subject'] || row['Title'] || row['Project Name'] || row['Name'] || '',
    description: row['Description'] || row['Body'] || row['Notes'] || '',
    status: row['Status'] || 'Not Started',
    priority: row['Priority'] || 'Medium',
    assigneeName: row['Assignee'] || row['Owner'] || row['People'] || '',
    companyName: row['Company'] || row['Account'] || '',
    deadline: parseDateValue(row['Deadline'] || row['Due Date']),
    url: row['URL'] || row['Link'] || '',
    billableHours: row['Billable Hours'] || row['billableHours'] || row['BillableHours'] || '',
  })).filter(item => item.projectName);
}

export async function processImport(
  items: ImportResult[],
  existingCompanies: Company[],
  teamMembers: TeamMember[],
  defaultGroupId: string,
  onProgress: (count: number) => void
) {
  const companyCache = new Map<string, string>();
  existingCompanies.forEach(c => companyCache.set(c.name.toLowerCase(), c.id));

  let processedCount = 0;

  for (const item of items) {
    let companyId = '';

    if (item.companyName) {
      const lowerName = item.companyName.toLowerCase();
      if (companyCache.has(lowerName)) {
        companyId = companyCache.get(lowerName)!;
      } else {
        companyId = await createCompany({
          name: item.companyName,
          domain: '',
          phone: '',
          email: '',
          street: '',
          city: '',
          state: '',
          zipcode: '',
          industry: '',
          founded: '',
          servicesOffered: '',
          productsOffered: '',
          hoursOfOperation: '',
          servicesNeeded: '',
          facebookUrl: '',
          referralSource: '',
          assignedToId: teamMembers[0]?.id || '',
          web: false,
          seo: false,
          ll: false,
          ppc: false,
          smm: false,
          sma: false,
          em: false,
        });
        companyCache.set(lowerName, companyId);
      }
    }

    const assignedTo = teamMembers.find(m =>
      m.name.toLowerCase() === item.assignedToName.toLowerCase()
    );

    await createContact({
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email,
      phone: item.phone,
      title: item.title,
      companyId: companyId,
      assignedToId: assignedTo?.id || '',
      status: 'Lead' as Status,
      groupId: defaultGroupId,
    });

    processedCount++;
    onProgress(processedCount);
  }
}

export async function processTicketImport(
  items: TicketImportResult[],
  workspace: string,
  existingCompanies: Company[],
  teamMembers: TeamMember[],
  onProgress: (count: number) => void,
  existingGroups?: any[]
) {
  const companyCache = new Map<string, string>();
  existingCompanies.forEach(c => companyCache.set(c.name.toLowerCase(), c.id));

  const groupCache = new Map<string, string>();
  if (existingGroups) {
    existingGroups.forEach(g => groupCache.set(g.name.toLowerCase(), g.id));
  }

  const createdTicketsCache = new Map<string, string>();

  let processedCount = 0;

  for (const item of items) {
    let companyId = '';

    if (item.companyName) {
      const lowerName = item.companyName.toLowerCase();
      if (companyCache.has(lowerName)) {
        companyId = companyCache.get(lowerName)!;
      } else {
        companyId = await createCompany({
          name: item.companyName,
          domain: '',
          phone: '',
          email: '',
          street: '',
          city: '',
          state: '',
          zipcode: '',
          industry: '',
          founded: '',
          servicesOffered: '',
          productsOffered: '',
          hoursOfOperation: '',
          servicesNeeded: '',
          facebookUrl: '',
          referralSource: '',
          assignedToId: teamMembers[0]?.id || '',
          web: false,
          seo: false,
          ll: false,
          ppc: false,
          smm: false,
          sma: false,
          em: false,
        });
        companyCache.set(lowerName, companyId);
      }
    }

    let groupId = '';
    if (item.groupName) {
      const lowerGroupName = item.groupName.toLowerCase();
      if (groupCache.has(lowerGroupName)) {
        groupId = groupCache.get(lowerGroupName)!;
      } else {
        const groupRef = await createGroup({
          name: item.groupName,
          workspace: workspace,
          order: groupCache.size
        });
        groupId = groupRef.id;
        groupCache.set(lowerGroupName, groupId);
      }
    }

    let parentId = '';
    if (item.isSubRow && item.parentName) {
      parentId = createdTicketsCache.get(item.parentName.toLowerCase()) || '';
    }

    const assignedTo = teamMembers.find(m =>
      m.name.toLowerCase() === item.assigneeName.toLowerCase()
    );

    const ticketId = await createTicket({
      projectName: item.projectName,
      description: item.description,
      status: item.status,
      priority: item.priority,
      assignee: assignedTo?.id || '',
      companyId: companyId,
      groupId: groupId || undefined,
      parentId: parentId || undefined,
      deadline: item.deadline,
      url: item.url,
      workspace: workspace,
      order: processedCount,
      billableHours: item.billableHours || '',
    });

    createdTicketsCache.set(item.projectName.toLowerCase(), ticketId);

    processedCount++;
    onProgress(processedCount);
  }
}

// ===================== Deal Import =====================

const DEAL_SECTION_HEADERS = [
  'active deals',
  'closed / won',
  'closed / won 2026',
  'closed / won 2025',
  'lost',
  '2025',
  '2026',
];

const DEAL_COLUMN_HEADERS = ['name', 'tasks', 'current step', 'status', 'owner', 'deal value', 'contacts', 'company', 'notes', 'last interaction', 'expected close date', 'close probability', 'forecast value'];

function isDealHeaderRow(row: string[]): boolean {
  const lower = row.map(c => (c || '').trim().toLowerCase());
  return lower.includes('name') &&
    lower.includes('status') &&
    (lower.includes('owner') || lower.includes('deal value') || lower.includes('current step'));
}

function isDealSectionHeader(row: string[]): boolean {
  const firstCell = (row[0] || '').trim().toLowerCase();
  const restEmpty = row.slice(1).every(c => !(c || '').trim());
  if (!firstCell || !restEmpty) return false;
  return DEAL_SECTION_HEADERS.some(h => firstCell.includes(h)) ||
    /^\d{4}$/.test(firstCell) ||
    firstCell.startsWith('closed') ||
    firstCell === 'lost' ||
    firstCell.startsWith('active');
}

function isSummaryRow(row: string[]): boolean {
  const firstCell = (row[0] || '').trim();
  if (firstCell) return false;
  // Summary rows have no name but may have aggregated values like totals
  const hasNumericValues = row.some(c => {
    const trimmed = (c || '').trim();
    return /^\d[\d,]*$/.test(trimmed) && parseInt(trimmed.replace(/,/g, '')) > 100;
  });
  return hasNumericValues;
}

function isSubitemRow(row: string[]): boolean {
  const firstCell = (row[0] || '').trim().toLowerCase();
  return firstCell === 'subitems';
}

export function parseDealCSV(rows: string[][]): DealImportResult[] {
  const results: DealImportResult[] = [];
  let currentSection = 'Active Deals';
  let headerMap: Record<string, number> = {};
  let hasHeaders = false;
  let skipNextDataRows = false; // skip subitem data rows

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(c => (c === undefined || c === null) ? '' : String(c).trim());

    // Skip completely empty rows
    if (row.every(c => c === '')) {
      skipNextDataRows = false;
      continue;
    }

    // Skip the "Learn how to" instruction line
    if (row.some(c => c.toLowerCase().includes('learn how to use'))) continue;

    // Skip the title "Deals / Sales" line
    if (row[0].toLowerCase() === 'deals / sales' && row.slice(1).every(c => !c)) continue;

    // Check section headers (Active Deals, Closed / Won 2026, Lost, 2025, etc.)
    if (isDealSectionHeader(row)) {
      currentSection = row[0].trim();
      hasHeaders = false;
      skipNextDataRows = false;
      continue;
    }

    // IMPORTANT: Check subitem headers BEFORE deal headers,
    // because "Subitems,Name,Owner,Status,..." also matches isDealHeaderRow
    if (isSubitemRow(row)) {
      skipNextDataRows = true;
      continue;
    }

    // Skip subitem data rows (they follow a "Subitems" header)
    // Subitem data rows always have an empty first column (e.g. ",Sitemap,,,,,")
    // A row with a non-empty first column means we're back to main deal rows
    if (skipNextDataRows) {
      if (!row[0]) {
        continue; // still a subitem data row (empty first cell)
      }
      // row[0] is non-empty, so this is a main row — stop skipping
      skipNextDataRows = false;
      // fall through to parse as main row or header
    }

    // Check column header rows
    if (isDealHeaderRow(row)) {
      headerMap = {};
      row.forEach((cell, idx) => {
        const key = cell.toLowerCase().trim();
        if (key) headerMap[key] = idx;
      });
      hasHeaders = true;
      skipNextDataRows = false;
      continue;
    }

    // Skip summary/total rows
    if (isSummaryRow(row)) continue;

    if (!hasHeaders) continue;

    const nameIdx = headerMap['name'] ?? 0;
    const currentStepIdx = headerMap['current step'] ?? 2;
    const statusIdx = headerMap['status'] ?? 3;
    const ownerIdx = headerMap['owner'] ?? 4;
    const dealValueIdx = headerMap['deal value'] ?? 5;
    const contactsIdx = headerMap['contacts'] ?? 6;
    const companyIdx = headerMap['company'] ?? 7;
    const notesIdx = headerMap['notes'] ?? 8;
    const lastInteractionIdx = headerMap['last interaction'] ?? 9;
    const expectedCloseDateIdx = headerMap['expected close date'] ?? 10;
    const closeProbabilityIdx = headerMap['close probability'] ?? 11;
    const forecastValueIdx = headerMap['forecast value'] ?? 12;

    const name = row[nameIdx] || '';
    if (!name) continue;

    results.push({
      name,
      currentStep: row[currentStepIdx] || '',
      status: row[statusIdx] || '',
      ownerName: row[ownerIdx] || '',
      dealValue: row[dealValueIdx] || '',
      contactName: row[contactsIdx] || '',
      companyName: row[companyIdx] || '',
      notes: row[notesIdx] || '',
      lastInteraction: parseDateValue(row[lastInteractionIdx]),
      expectedCloseDate: parseDateValue(row[expectedCloseDateIdx]),
      closeProbability: row[closeProbabilityIdx] || '',
      forecastValue: row[forecastValueIdx] || '',
      section: currentSection,
    });
  }

  return results;
}

export function mapDealImportData(rawData: any[]): DealImportResult[] {
  // If already parsed by parseDealCSV, just return
  if (rawData.length > 0 && rawData[0].name !== undefined && rawData[0].section !== undefined) {
    return rawData as DealImportResult[];
  }
  // Fallback for generic key-value row data
  return rawData.map(row => ({
    name: row['Name'] || row['name'] || '',
    currentStep: row['Current Step'] || row['current step'] || '',
    status: row['Status'] || row['status'] || '',
    ownerName: row['Owner'] || row['owner'] || row['People'] || '',
    dealValue: row['Deal Value'] || row['deal value'] || '',
    contactName: row['Contacts'] || row['contacts'] || row['Contact'] || '',
    companyName: row['Company'] || row['company'] || '',
    notes: row['Notes'] || row['notes'] || '',
    lastInteraction: parseDateValue(row['Last interaction'] || row['last interaction']),
    expectedCloseDate: parseDateValue(row['Expected Close Date'] || row['expected close date']),
    closeProbability: row['Close Probability'] || row['close probability'] || '',
    forecastValue: row['Forecast Value'] || row['forecast value'] || '',
    section: 'Active Deals',
  })).filter(item => item.name);
}

function mapDealStatus(csvStatus: string, section: string): string {
  const s = csvStatus.trim();
  const sec = section.toLowerCase();

  if (sec.includes('won') || s.toLowerCase() === 'won') return 'WON';
  if (sec === 'lost' || s.toLowerCase() === 'lost') return 'LOST';
  if (s === 'Need to Follow Up') return 'Need to Follow Up';
  if (s === 'Client Hold Request') return 'Client Hold Request';
  if (s === 'Awaiting Customer') return 'Awaiting Customer';
  if (s === 'Unresponsive') return 'Unresponsive';
  if (s === 'In Progress') return 'In Progress';
  if (s === 'Need to Call / Email') return 'Need to Call / Email';

  // If no status but in a section, infer
  if (!s && sec.includes('won')) return 'WON';
  if (!s && sec === 'lost') return 'LOST';

  return s || 'Not started';
}

function mapDealStep(csvStep: string): string {
  const s = csvStep.trim();
  if (!s) return '';

  const lower = s.toLowerCase();
  
  // Clean common prefixes like "step 1:", "1.", etc.
  const clean = lower.replace(/^(step\s*\d+\s*:\s*|\d+\s*[\.\-:]\s*)/i, '').trim();

  const stepMap: Record<string, string> = {
    'discovery call': '1. Onboarding',
    'onboarding': '1. Onboarding',
    'onboarding form': '1. Onboarding',
    'strategy meeting': '2. Strategy Meeting',
    'plan & proposal': '3. Plan & Proposal',
    'proposal signing': '4. Proposal Signing',
    'deposit payment': '5. Deposit Payment',
    '50% deposit payment': '5. Deposit Payment',
    'content collection': '6. Content Collection',
    'website design': '7. Website Design',
    'design proofing': '8. Design Proofing',
    'website development': '9. Website Development',
    'development proofing': '10. Development Proofing',
    'final payment': '11. Final Payment',
    'launch checklist': '12. Launch Checklist',
    'launch': '13. Launch',
  };

  return stepMap[clean] || s;
}

export async function processDealImport(
  items: DealImportResult[],
  existingCompanies: Company[],
  existingContacts: { id: string; firstName: string; lastName: string; companyId: string }[],
  teamMembers: TeamMember[],
  existingDeals: Deal[],
  onProgress: (count: number) => void
) {
  const companyCache = new Map<string, string>();
  existingCompanies.forEach(c => companyCache.set(c.name.toLowerCase(), c.id));

  const dealNameCache = new Set<string>();
  existingDeals.forEach(d => dealNameCache.add(d.name.toLowerCase()));

  let processedCount = 0;

  for (const item of items) {
    // Skip if a deal with this name already exists
    if (dealNameCache.has(item.name.toLowerCase())) {
      processedCount++;
      onProgress(processedCount);
      continue;
    }

    let companyId = '';

    if (item.companyName) {
      const lowerName = item.companyName.toLowerCase();
      if (companyCache.has(lowerName)) {
        companyId = companyCache.get(lowerName)!;
      } else {
        companyId = await createCompany({
          name: item.companyName,
          domain: '',
          phone: '',
          email: '',
          street: '',
          city: '',
          state: '',
          zipcode: '',
          industry: '',
          founded: '',
          servicesOffered: '',
          productsOffered: '',
          hoursOfOperation: '',
          servicesNeeded: '',
          facebookUrl: '',
          referralSource: '',
          assignedToId: teamMembers[0]?.id || '',
          web: false,
          seo: false,
          ll: false,
          ppc: false,
          smm: false,
          sma: false,
          em: false,
        });
        companyCache.set(lowerName, companyId);
      }
    }

    // Match contact by name
    let contactId = '';
    if (item.contactName) {
      const contactNames = item.contactName.split(',').map(n => n.trim());
      const firstContactName = contactNames[0];
      if (firstContactName) {
        const parts = firstContactName.split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const found = existingContacts.find(c =>
          c.firstName.toLowerCase() === firstName.toLowerCase() &&
          (lastName === '' || c.lastName.toLowerCase() === lastName.toLowerCase())
        );
        if (found) {
          contactId = found.id;
        }
      }
    }

    // Match owner to team member
    let assignedToId = '';
    if (item.ownerName) {
      // Handle comma-separated owners (take first)
      const ownerNames = item.ownerName.split(',').map(n => n.trim());
      for (const ownerName of ownerNames) {
        const found = teamMembers.find(m =>
          m.name.toLowerCase() === ownerName.toLowerCase() ||
          m.name.toLowerCase().includes(ownerName.toLowerCase()) ||
          ownerName.toLowerCase().includes(m.name.toLowerCase())
        );
        if (found) {
          assignedToId = found.id;
          break;
        }
      }
    }

    const mappedStatus = mapDealStatus(item.status, item.section);
    const mappedStep = mapDealStep(item.currentStep);

    // Build notes array
    const dealNotes: { id: string; text: string; createdAt: string; author?: string }[] = [];
    if (item.notes && item.notes !== '/') {
      dealNotes.push({
        id: Date.now().toString() + '-' + processedCount,
        text: item.notes,
        createdAt: new Date().toISOString(),
        author: 'Import',
      });
    }

    const newDeal: Omit<Deal, 'id'> = {
      name: item.name,
      currentStep: mappedStep,
      status: mappedStatus,
      assignedToId,
      value: item.dealValue ? String(item.dealValue) : '',
      companyId,
      contactId,
      notes: dealNotes,
      order: processedCount,
    };

    await createDeal(newDeal);
    dealNameCache.add(item.name.toLowerCase());

    processedCount++;
    onProgress(processedCount);
  }
}
