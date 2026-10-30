# Portal support

Support uses the existing Support Tickets board and its `tickets` documents. Portal messages live under `tickets/{id}/messages`; the existing `updates` array and notes remain internal. Ordinary Post actions never call the client messaging endpoint. The full ticket view keeps Client conversation closed until explicitly opened. The side panel has a separate Client conversation tab. Its send button says Send reply to client.

The Portal's existing shared CRM connection can map one CRM company to one client account under Integrations → Support. Discovery and a real ticket preview precede saving. A company cannot be active in two Portal accounts. Only Support Tickets roots with the matching stable company ID are returned. Existing public submissions (`isManual=false`) are eligible unless explicitly hidden. Manual tickets require a deliberate sharing action and a company/requester. No company is inferred from a name or email alone.

Client responses allow only title, description, category, priority, public status, submission timestamps, public attachments and client messages. Needs Invoiced, Done and Closed become Completed. Hours, billing dates, internal notes/updates, assignees and credentials never enter the client projection. Conversation writes change only conversation metadata/participants; they do not change status, deadline, hours, updatedAt or the billing month.

## Server endpoints

Set a dedicated server-only `PORTAL_SUPPORT_API_TOKEN` (32+ random characters) separately in Vercel Preview and Production. This credential is independent of the existing read-only Listings/SEO token. Portal uses the matching `CRM_SUPPORT_API_TOKEN` secret and `CRM_API_URL=https://<crm-host>/api`.

- `GET /api/portal/health` verifies the named CRM database and reports messaging readiness.
- `GET /api/portal/clients` returns company IDs, names and domains for administrator setup.
- `GET/POST /api/portal/clients/:resourceId/tickets`
- `GET /api/portal/clients/:resourceId/tickets/:ticketId`
- `POST /api/portal/clients/:resourceId/tickets/:ticketId/messages`
- `GET /api/portal/clients/:resourceId/tickets/:ticketId/attachments/:messageId/:fileId`

Portal supplies authenticated name/email and the admin-confirmed company ID; browser identity fields are rejected. Writes use a UUID request ID, a JSON `payload` multipart field, and optional repeated `files` fields. At most five files and 3 MB total fit within Vercel's request limit. Incoming email permits up to 20 files within the same 3 MB total because ordinary email signatures carry inline images; the Portal/CRM upload control remains limited to five. Email images are preserved as private attachments. Files remain in private Firebase Storage objects and are downloaded through the authenticated tenant-scoped API. Office documents, PDFs, raster images, ZIP, CSV and text are allowed; HTML/SVG/script files are refused.

CRM staff endpoints under `/api/support/tickets/:id` require a current Firebase ID token, revocation checking, same-origin writes, and a current support role/workspace permission. Sharing and retry endpoints are separate from message creation. Email recipients derive from the ticket and current active staff profiles; the browser cannot select arbitrary recipients. Requesters and contacts who participate through the Portal can continue by email.

## Email and public form compatibility

Existing Mailgun `inbound+...` routes also match `inbound+st.<ticket>.<signature>@<domain>`. The routing signature is bound to ticket and recipient, domain-separated using the existing Mailgun signing key. Staff group replies additionally require an active support team profile. New inbound support posts require Mailgun's signing-key HMAC, a recent timestamp and a Message-ID. Message IDs and request UUIDs deduplicate retries. Automatic responses are ignored. Contact email behavior outside this new prefix is preserved.

Preview deployments fail closed for support email unless `PORTAL_SUPPORT_PREVIEW_RECIPIENT` names the agreed internal test inbox; all other recipients are refused. Production ignores this preview-only restriction.

Messages are persisted before email. Each recipient has a durable notification record. An accepted provider response is recorded as accepted, never delivered. A definitive rejection can be retried; a timeout/5xx remains uncertain and is not automatically sent again. Internal operational diagnostics contain no submission body or credentials.

The canonical WordPress connector's narrowly scoped `support-tickets.php` hooks only awebco.com's verified Gravity Form 80. It reuses that form's existing active CRM webhook secret in memory, ensures one ticket for its entry ID, and rewrites only recognized team/requester Reply-To headers. Notifications, recipients, category/priority, uploads and public form access remain intact. Unknown recipients or a routing failure retain the original notification. Other websites/forms are inert. Receiving requires the Mailgun domain’s verified MX records and a direct, non-redirecting inbound route. The existing sending-only DNS setup must be completed before email replies are enabled.

Public intake automatically links a company only when a unique existing company and requester contact agree on the stable CRM company ID. Unregistered or ambiguous requesters still create tickets and exchange email; staff link their company before Portal visibility. Replays/adoption preserve existing ticket IDs, status, notes, hours and completion dates. Historical email that went directly between inboxes is not imported retroactively.

## Validation

Focused checks: `node --import tsx --test tests/support.test.ts`, TypeScript, focused ESLint and a Next build. The support checks cover tenant isolation, redaction, idempotency, simultaneous replies, private attachments, uncertain sends, public form replay and billing preservation. WordPress hooks have offline fixtures in the canonical connector. Verify the actual CRM/Portal desktop and phone screens before source publication, then verify staging before production and actual authorized inbox round trips after cutover.

## Email presentation

Support sends from `Awebco Support <support@SUPPORT_SENDING_DOMAIN>` so the sender matches the verified delivery domain. The optional sending domain defaults to `MAILGUN_DOMAIN`; Awebco uses its established `mg.awebco.com` sending domain while `MAILGUN_DOMAIN=mg.crm.awebco.com` continues receiving existing signed replies. This does not change other CRM emails or any mailbox filtering. The existing CRM logo is embedded inline; the function build traces that static asset. HTML and plain-text versions share one ticket action. Production links always use the production Portal and omit a stored account ID; the authenticated Portal resolves the current account mapping. Preview delivery stays restricted to its agreed test inbox.

Incoming email keeps its original text and files. Client/staff projections separate the signature and inline images into a collapsed section; real attachments remain visible. The rendered notification contains the new reply and real attachments, never signature images as regular attachments. Replies from email do not echo back to the sender, and the most recent incoming Message-ID supplies threading headers for subsequent responses. Conversation updates still leave billing dates/hours/status alone.
