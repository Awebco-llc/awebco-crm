import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const MAX_REQUESTS = 100;
export const MAX_WRITES = 25;
export const PAGE_SIZE = 25;
export const PRIVATE_COLLECTION = '_mcp';
export const workspaces = ['Awebco', 'Websites', 'Design & Print', 'Google Ads', 'Local Listings', 'SEO', 'Social Media', 'Support Tickets'] as const;
export const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const workspaceSchema = z.enum(workspaces);
export const patchSchema = z.object({
  status: z.enum(['Not Started', 'Setup', 'Planning', 'In Progress', 'Awaiting Customer', 'Awaiting Review', 'Needs Invoiced', 'Running', 'On Hold', 'Done', 'Closed', 'Down', 'S7: Content Collection', 'S8: Design', 'S9: Design Proofing', 'S10: Development', 'S11: Development Proofing', 'S12: Final Payment', 'S13: Launch Checklist', 'S14: Launched', 'ON HOLD']).optional(),
  deadline: z.string().refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Use a valid YYYY-MM-DD date or an empty string').optional(),
  priority: z.enum(['', 'Low', 'Medium', 'High', 'Urgent']).optional(),
  description: z.string().max(8000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Supply at least one field');

function mac(payload: string, signingKey: string) {
  return createHmac('sha256', signingKey).update(`awebco-crm-mcp-v1:${payload}`).digest('base64url');
}

export function issueToken(signingKey: string) {
  const id = randomBytes(16).toString('hex');
  const payload = `awcrm.${id}.${randomBytes(32).toString('base64url')}`;
  return { id, token: `${payload}.${mac(payload, signingKey)}` };
}

// Reject forged keys before any database read. The signing key never leaves the server.
export function tokenId(token: string, signingKey: string): string | null {
  const match = /^awcrm\.([a-f0-9]{32})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const payload = token.slice(0, token.lastIndexOf('.'));
  const expected = Buffer.from(mac(payload, signingKey));
  const supplied = Buffer.from(match[3]);
  return timingSafeEqual(expected, supplied) ? match[1] : null;
}

export function nextBudget(data: Record<string, unknown>, day: string, write = false) {
  const requests = data.day === day ? Number(data.requests) || 0 : 0;
  const writes = data.day === day ? Number(data.writes) || 0 : 0;
  if (requests >= MAX_REQUESTS || (write && writes >= MAX_WRITES)) throw new Error('Daily MCP limit reached. Try again tomorrow (UTC).');
  return { day, requests: requests + 1, writes: writes + Number(write) };
}

export function groupForStatus(workspace: string, status: string, current?: string) {
  if (workspace === 'SEO') return undefined;
  if (workspace === 'Google Ads') return status === 'Running' ? 'group-running' : 'group-active';
  if (status === 'Running') return 'group-running';
  if (status === 'Needs Invoiced') return 'group-needs-invoiced';
  if (['S14: Launched', 'Launched', 'Done', 'Closed'].includes(status)) return 'group-completed';
  if (['group-running', 'group-needs-invoiced', 'group-completed'].includes(current || '')) {
    return workspace === 'Local Listings' ? 'group-setup' : workspace === 'Social Media' ? 'group-smm' : 'group-active';
  }
  return undefined;
}

export function statusesForWorkspace(workspace: string): string[] {
  if (workspace === 'Websites') return ['S7: Content Collection', 'S8: Design', 'S9: Design Proofing', 'S10: Development', 'S11: Development Proofing', 'S12: Final Payment', 'S13: Launch Checklist', 'S14: Launched', 'ON HOLD'];
  if (workspace === 'Awebco') return ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Awaiting Review', 'Done'];
  const statuses = ['Not Started', 'In Progress', 'Awaiting Customer', 'Needs Invoiced', 'On Hold', 'Done'];
  if (['Google Ads', 'Social Media', 'Local Listings'].includes(workspace)) statuses.push('Setup', 'Running');
  if (workspace === 'Local Listings') statuses.push('Down');
  if (workspace === 'Support Tickets') statuses.push('Closed');
  return statuses;
}

export const fields = {
  tickets: ['parentId', 'projectName', 'assignee', 'assignees', 'status', 'deadline', 'url', 'description', 'notes', 'planType', 'priority', 'companyId', 'companyName', 'contactName', 'email', 'category', 'groupId', 'workspace', 'order', 'createdAt', 'updatedAt'],
  companies: ['name', 'domain', 'phone', 'email', 'street', 'city', 'state', 'zipcode', 'industry', 'servicesOffered', 'productsOffered', 'hoursOfOperation', 'servicesNeeded', 'assignedToId', 'primaryContactId', 'description', 'web', 'seo', 'll', 'ppc', 'smm', 'sma', 'em', 'dp', 'support', 'awebco', 'webNotes', 'seoNotes', 'llNotes', 'ppcNotes', 'smmNotes', 'smaNotes', 'emNotes', 'dpNotes', 'supportNotes', 'awebcoNotes'],
  contacts: ['firstName', 'lastName', 'title', 'phone', 'companyId', 'assignedToId', 'email', 'status'],
  products: ['name', 'description', 'price', 'url', 'sku', 'type'],
} as const;

// Explicit projection: never return passwords, payment details, files or arbitrary custom fields.
export function projectRecord(collection: keyof typeof fields, id: string, data: Record<string, unknown>, detailed = false) {
  const output: Record<string, unknown> = { id };
  for (const field of fields[collection]) {
    if (!detailed && (field === 'description' || field === 'notes' || field.endsWith('Notes'))) continue;
    const value = data[field];
    if (typeof value === 'string') output[field] = value.slice(0, detailed ? 8000 : 500);
    else if (typeof value === 'boolean' || typeof value === 'number') output[field] = value;
    else if (field === 'assignees' && Array.isArray(value)) output[field] = value.filter(v => typeof v === 'string').slice(0, 30);
    else if (value && typeof (value as { toDate?: unknown }).toDate === 'function') output[field] = (value as { toDate(): Date }).toDate().toISOString();
  }
  if (detailed && collection === 'tickets' && Array.isArray(data.updates)) {
    output.updates = data.updates.slice(-10).filter(update => update && typeof update === 'object').map(update => ({ id: String(update.id || '').slice(0, 128), author: String(update.author || '').slice(0, 100), text: String(update.text || '').slice(0, 2000), timestamp: String(update.timestamp || '').slice(0, 100) }));
  }
  return output;
}

export function escapeNote(text: string) {
  return `<p>${text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!).replace(/\n/g, '<br>')}</p>`;
}
