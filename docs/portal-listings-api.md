# Portal Local Listings API

The read-only API is available at `/api/portal/listings`. Set a dedicated `PORTAL_LISTINGS_API_TOKEN` with at least 32 characters in the server environment. Send it as `Authorization: Bearer <token>`; query-string credentials are not supported.

- `GET /resources?cursor=<document-id>` returns `{ resources: [{ id, name, companyId? }], nextCursor }`.
- `GET /resources/<resource-id>?cursor=<document-id>` returns `{ resource: { id, name, companyId? }, listings: [{ id, name, status, url }], nextCursor }`.

Cursors are stable Firestore document IDs. Omit `cursor` on the first request and continue while `nextCursor` is non-null. Each response contains at most 200 rows, only the documented fields, and uses `Cache-Control: no-store`.
