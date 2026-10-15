# Portal Local Listings API

The read-only API is available at `/api/portal/listings`. Set a dedicated `PORTAL_LISTINGS_API_TOKEN` with at least 32 characters in the server environment. Send it as `Authorization: Bearer <token>`; query-string credentials are not supported.

- `GET /resources?cursor=<document-id>` returns `{ resources: [{ id, name, companyId? }], nextCursor }`.
- `GET /resources/<resource-id>?cursor=<document-id>` returns `{ resource: { id, name, companyId? }, listings: [{ id, name, status, url }], nextCursor }`.

Cursors are stable Firestore document IDs. Omit `cursor` on the first request and continue while `nextCursor` is non-null. Each response contains at most 200 rows, only the documented fields, and uses `Cache-Control: no-store`.

Rollout verification on October 15, 2026: the integration branch incorporates main `ac039fe` (the Unresponsive/Declined company sections) without changes to the existing CRM board, Firebase configuration, rules, support or MCP routes. The 11 listings tests, 8 existing MCP tests, TypeScript check and production build passed. The full repository lint retains three pre-existing errors outside this change; listings files pass lint. Preview authentication returned 401 without the dedicated token and 200 with it. Paginated discovery returned 43 parents; Boswell Trade Center returned 27 directories (26 active, one attention), matching the live CRM board. Server responses contain only the documented public fields. Production and Preview use separate dedicated random secrets. Portal staging additionally uses an explicitly approved Vercel project automation token to reach the protected preview; application bearer authentication remains required.
