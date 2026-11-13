import { NextRequest } from 'next/server';
import { createSupportHandlers } from '@/lib/supportHandlers';
export const runtime = 'nodejs';
const handlers = createSupportHandlers();
export function GET(request: NextRequest, context: {params: Promise<{resourceId: string; ticketId: string; personId: string}>}) {
  return handlers.photo(request, context);
}
