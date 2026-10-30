import { NextRequest } from 'next/server';
import { createSupportHandlers } from '@/lib/supportHandlers';
export const runtime = 'nodejs';
export const maxDuration = 60;
const handlers = createSupportHandlers();
export function GET(request: NextRequest, context: { params: Promise<{ resourceId: string }> }) { return handlers.list(request, context); }
export function POST(request: NextRequest, context: { params: Promise<{ resourceId: string }> }) { return handlers.create(request, context); }
