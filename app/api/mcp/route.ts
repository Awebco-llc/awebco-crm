import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateAgent, errorResponse, readJson, AccessError } from '@/lib/mcp/access';
import { createCrmServer } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const access = await authenticateAgent(request);
    if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw new AccessError('Use application/json.', 415);
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError('Send one MCP request at a time.', 400);
    const server = createCrmServer(access);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request, { parsedBody: body });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } finally { await server.close(); }
  } catch (error) { return errorResponse(error); }
}

// Stateless JSON transport: no persistent connection or background polling.
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }); }
export const DELETE = GET;
