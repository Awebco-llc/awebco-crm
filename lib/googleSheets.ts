/**
 * lib/googleSheets.ts
 * Server-side helper for writing SEO board data to Google Sheets.
 *
 * Required env vars (server-side only, no NEXT_PUBLIC_ prefix):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (copy exactly from JSON key file, \n as literal \n)
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 */

import { google } from 'googleapis';

export interface SheetRow {
  taskName: string;
  type: 'Task' | 'Sub-task';
  status: string;
  assignee: string;
  deadline: string;
  lastUpdated: string;
  url: string;
}

export interface GroupSection {
  groupName: string;
  rows: SheetRow[];
}

function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. ' +
      'Add them to your .env file and restart the dev server.'
    );
  }

  // .env stores literal \n — convert to real newlines
  const key = rawKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/** Write all group sections to the spreadsheet, one tab per group. */
export async function syncGroupsToSheet(sections: GroupSection[]): Promise<number> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID in environment.');
  }

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch existing tabs so we know which ones to create vs. reuse
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = meta.data.sheets ?? [];

  const formatRequests: object[] = [];
  let totalRows = 0;

  for (const section of sections) {
    const tabTitle = section.groupName.slice(0, 100); // Sheets max tab name length

    const existing = existingSheets.find(
      (s) => s.properties?.title === tabTitle
    );

    let sheetId: number;

    if (existing) {
      sheetId = existing.properties!.sheetId!;
      // Wipe existing content before rewriting
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${tabTitle}'`,
      });
    } else {
      // Create the tab
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabTitle } } }],
        },
      });
      sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    }

    // ── Build row values ──────────────────────────────────────────────────────
    const HEADER = ['Task / Sub-task', 'Type', 'Status', 'Assignee', 'Deadline', 'Last Updated', 'URL'];
    const dataRows = section.rows.map((r) => [
      r.type === 'Sub-task' ? `   ↳  ${r.taskName}` : r.taskName,
      r.type,
      r.status || 'Not Started',
      r.assignee || 'Unassigned',
      r.deadline || '—',
      r.lastUpdated || '—',
      r.url || '',
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER, ...dataRows] },
    });

    totalRows += dataRows.length;

    // ── Formatting requests ───────────────────────────────────────────────────
    // Blue header row
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.063, green: 0.380, blue: 0.890 }, // #1061E3
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });

    // Freeze the header row
    formatRequests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // Light grey background + italic for sub-task rows
    section.rows.forEach((r, i) => {
      if (r.type !== 'Sub-task') return;
      const rowIdx = i + 1; // +1 for header
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.97, green: 0.97, blue: 0.98 },
              textFormat: {
                italic: true,
                foregroundColor: { red: 0.35, green: 0.39, blue: 0.44 },
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      });
    });

    // Auto-resize all columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 7 },
      },
    });
  }

  // Apply all formatting in one batch call
  if (formatRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests },
    });
  }

  return totalRows;
}
