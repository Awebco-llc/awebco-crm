import { NextRequest } from 'next/server';
import { createSupportHandlers } from '@/lib/supportHandlers';
export const runtime = 'nodejs';
export const maxDuration = 60;
const handlers = createSupportHandlers();
export function POST(request: NextRequest, context: { params: Promise<{ resourceId: string; ticketId: string }> }) { return handlers.reply(request, context); }
