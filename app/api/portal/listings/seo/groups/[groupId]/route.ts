import { NextRequest } from "next/server";
import { createSeoHandler } from "@/lib/portalSeoHandlers";
export const runtime = "nodejs";
const handler = createSeoHandler();
export function GET(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  return handler(request, context);
}
