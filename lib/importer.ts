import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Company, Contact, TeamMember, Status, Ticket } from '@/components/Shared';
import { createCompany, createContact, createTicket, createGroup } from '@/lib/crmStore';

export interface ImportResult {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  title: string;
  assignedToName: string;
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
