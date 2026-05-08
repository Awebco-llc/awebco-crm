import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Company, Contact, TeamMember, Status } from '@/components/Shared';
import { createCompany, createContact } from '@/lib/crmStore';

export interface ImportResult {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  title: string;
  assignedToName: string;
}

export async function parseFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: false, // Start with false to find the real header
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
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
  // Look for a row that contains common contact headers
  return rows.findIndex(row => 
    row.some(cell => typeof cell === 'string' && (
      cell.toLowerCase().includes('email') || 
      cell.toLowerCase().includes('first name') ||
      cell.toLowerCase().includes('last name')
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
        // Create new company
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
      assignedToId: assignedTo?.id || teamMembers[0]?.id || '',
      status: 'Lead' as Status,
      groupId: defaultGroupId,
    });
    
    processedCount++;
    onProgress(processedCount);
  }
}
