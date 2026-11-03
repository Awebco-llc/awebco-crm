import { extensionHandlers } from "@/lib/extension/listings";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ resourceId: string }> },
) {
  return extensionHandlers().resource(
    request,
    (await context.params).resourceId,
  );
}
