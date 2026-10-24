# Read-only Portal SEO extension

Extends the existing `/api/portal/listings` integration without changing the Listings contract, board, custom columns, support routes, credentials or Firestore data. Uses the same dedicated bearer token and named Firestore database resolver.

- `GET /api/portal/listings/seo/groups`: stable SEO group IDs and display names, bounded to 500 groups.
- `GET /api/portal/listings/seo/groups/:groupId?options=<JSON>`: bounded read-only transaction (1000 tasks), projected fields selected by an explicit server-side Portal mapping. Options contain `fields` (title/status/allocation/visibility/url, optional year), `publicValue`, `doneValue`, `publicOrigin`, and an exact raw-value → YYYY-MM `periods` dictionary (max 24 values). Private/reserved fields cannot be selected. Public approval must use a distinct field.
- `previews=1` additionally retrieves safe metadata for at most 12 approved completed leaf URLs. Portal invokes this only from an explicit admin refresh and caches metadata separately; normal report viewing/finalization does not fetch websites.

Custom values are read as `ticket[fieldId]`. No year is inferred. Exact allocation values must contain a year, e.g. `September 2026`. If year lives in a separate mapped string field, the dictionary key is `September | 2026`. Month-only configuration is rejected; absent/unmapped source values have a null allocated period. Parent values and `updatedAt` are never substituted.

Hidden/moved/orphan/cyclic tasks are redacted before crossing the CRM API. Every ancestor must be approved and in the exact group/workspace. Both SEO task detail views provide a default-hidden Show in client reports control backed by portalVisibility = Approved. It changes no task until the operator selects it. The mapping fields disclosure shows browser-local month/year column IDs. The read API also returns admin-only field-presence/type errors, eligibility counts and an approved-only sample; invalid mapped IDs cannot silently activate. Legitimate future plans do not require completed work to save. Only structural IDs and the public title/status/allocation/URL projection cross to the authenticated Portal server; clients receive no structural IDs. Portal applies its own completed/public-origin allowlist again before snapshots. An approved completed page parent takes precedence over same-period checklist children; text-only containers remain omitted.

Public metadata retrieval uses public-IPv4 DNS checks, a pinned HTTPS lookup with normal hostname TLS verification, no credentials/cookies, redirect refusal, noindex checks, a 3.5-second overall deadline and a 256 KB body cap. Only safe same-origin preview images are allowed. IPv6-only or query-dependent pages gracefully fall back. There is no third-party service, new credential or task writer.

Automatic Git preview deployment was initially disabled while rollout was prohibited. The branch-specific guard was removed only after explicit rollout authorization. Deployed revisions and verification are recorded in the Portal rollout evidence.

Local checks: TypeScript, existing Listings/MCP tests plus `tests/portal-seo.test.ts`, focused ESLint and Next build. All fixtures are synthetic. Live Month/year and public approval field IDs remain unverified and must be configured explicitly in Portal before activation. No live CRM data was changed.

## Automatic mapped-group reporting (October 24 correction)

The no-options endpoint uses the native Deadline as the assigned month and status Done as completion. A mapped SEO group needs no per-task approval: an absent `portalVisibility` defaults to inclusion of the safe title/status/assigned-month/page-link projection. Explicit `Hidden` (including any ancestor) and unknown visibility values remain excluded. No task is rewritten. Legacy explicit-options consumers retain their existing approval contract. Local Listings is unchanged and independent. Private comments, descriptions, credentials and attachments are never selected or returned. Public page URLs remain restricted to the company's website and its www alias.

The CRM checkbox reflects the automatic default and allows an explicit privacy opt-out. Connecting a group and generating a new Portal revision does not alter any historical report. The earlier approval-required description above applies only to legacy explicit-options consumers.
