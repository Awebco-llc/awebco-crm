export const dynamic = "force-dynamic";
export function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId)
    return Response.json(
      { error: "CRM sign-in is temporarily unavailable." },
      { status: 503 },
    );
  // Public Firebase web configuration, already used by the CRM sign-in page.
  return Response.json(
    { apiKey, projectId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
