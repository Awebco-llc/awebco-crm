import { NextRequest } from 'next/server';
import { createSupportHandlers } from '@/lib/supportHandlers';
export const runtime = 'nodejs';
export const maxDuration = 60;
const handlers = createSupportHandlers();
export function POST(request: NextRequest) { return handlers.staffReferences(request); }
