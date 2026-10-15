import { createListResourcesHandler } from '@/lib/portalListingsHandlers';

export const runtime = 'nodejs';
export const GET = createListResourcesHandler();
