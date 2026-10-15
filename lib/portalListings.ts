import { createHash, timingSafeEqual } from 'node:crypto';

export const LISTINGS_WORKSPACE = 'Local Listings';
export const LISTINGS_PAGE_SIZE = 200;
const MAX_SCAN_SIZE = 200;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CREDENTIAL_URL_PARAMETERS = new Set([
  'password', 'passwd', 'pass', 'token', 'access_token', 'refresh_token', 'id_token',
  'api_key', 'apikey', 'secret', 'authorization', 'auth', 'username', 'user', 'login', 'email', 'key',
]);

export type PublicResource = { id: string; name: string; companyId?: string };
export type PublicListing = {
  id: string;
  name: string;
  status: 'active' | 'attention' | 'on_hold' | 'pending' | 'unknown';
  url: string | null;
};

export function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && ID_PATTERN.test(value);
}

export function readCursor(values: string[]): string | undefined | null {
  if (values.length === 0) return undefined;
  if (values.length !== 1 || !validDocumentId(values[0])) return null;
  return values[0];
}

export function checkListingsAuth(authorization: string | null, expectedToken: string | undefined): 'ok' | 'unauthorized' | 'misconfigured' {
  if (!expectedToken || expectedToken.length < 32) return 'misconfigured';
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) return 'unauthorized';
  const expected = createHash('sha256').update(expectedToken, 'utf8').digest();
  const supplied = createHash('sha256').update(match[1], 'utf8').digest();
  return timingSafeEqual(expected, supplied) ? 'ok' : 'unauthorized';
}

function safeCompanyId(data: Record<string, unknown>): string | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(data, 'companyId')) return undefined;
  if (data.companyId === undefined || data.companyId === null || data.companyId === '') return undefined;
  return validDocumentId(data.companyId)
    ? data.companyId
    : null;
}

export function toPublicResource(id: string, data: Record<string, unknown>): PublicResource | null {
  if (!validDocumentId(id) || typeof data.projectName !== 'string' || !data.projectName.trim() || data.projectName.trim().length > 200) return null;
  const companyId = safeCompanyId(data);
  if (companyId === null) return null;
  return { id, name: data.projectName.trim(), ...(companyId ? { companyId } : {}) };
}

export function mapListingStatus(status: unknown): PublicListing['status'] {
  if (status === 'Running') return 'active';
  if (status === 'Down') return 'attention';
  if (status === 'On Hold') return 'on_hold';
  if (status === 'Not Started' || status === 'Setup' || status === 'In Progress') return 'pending';
  return 'unknown';
}

export function safeListingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return null;
    const hasCredentialParameter = (parameters: URLSearchParams) =>
      [...parameters.keys()].some(key => CREDENTIAL_URL_PARAMETERS.has(key.toLowerCase().replace(/-/g, '_')));
    if (hasCredentialParameter(parsed.searchParams)) return null;

    const fragment = parsed.hash.slice(1);
    const fragmentQuery = fragment.slice(fragment.lastIndexOf('?') + 1);
    if ((fragment.includes('=') || fragment.includes('&')) && hasCredentialParameter(new URLSearchParams(fragmentQuery))) return null;

    const url = parsed.toString();
    return url.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}

export function toPublicListing(id: string, data: Record<string, unknown>): PublicListing | null {
  if (!validDocumentId(id) || typeof data.projectName !== 'string' || !data.projectName.trim() || data.projectName.trim().length > 200) return null;
  if (safeCompanyId(data) === null) return null;
  return {
    id,
    name: data.projectName.trim(),
    status: mapListingStatus(data.status),
    url: safeListingUrl(data.url),
  };
}

export function isRootTicket(data: Record<string, unknown>): boolean {
  return !data.parentId;
}

export function belongsToResource(data: Record<string, unknown>, resourceId: string, companyId?: string): boolean {
  if (data.workspace !== LISTINGS_WORKSPACE || data.parentId !== resourceId) return false;
  if (companyId && typeof data.companyId === 'string' && data.companyId !== '' && data.companyId !== companyId) return false;
  return true;
}

export function paginateSafeRows<T extends { id: string }>(
  records: Array<{ id: string; data: Record<string, unknown> }>,
  transform: (id: string, data: Record<string, unknown>) => T | null,
): { items: T[]; nextCursor: string | null } {
  const items: T[] = [];
  let lastScannedId: string | undefined;
  let hasMoreItems = false;

  for (const record of records.slice(0, MAX_SCAN_SIZE)) {
    lastScannedId = record.id;
    const item = transform(record.id, record.data);
    if (!item) continue;
    if (items.length === LISTINGS_PAGE_SIZE) {
      hasMoreItems = true;
      break;
    }
    items.push(item);
  }

  if (hasMoreItems) return { items, nextCursor: items[items.length - 1].id };
  return {
    items,
    nextCursor: records.length > MAX_SCAN_SIZE ? lastScannedId ?? null : null,
  };
}

export const MAX_LISTINGS_SCAN_SIZE = MAX_SCAN_SIZE;
