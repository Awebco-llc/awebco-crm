# Awebco CRM agent connection

The MCP server lives at `https://YOUR-CRM-DOMAIN/api/mcp`, in the existing Next.js app. No separate hosting, Redis, paid MCP service, new Firebase database, or model API key is needed. Agents use their existing AI subscription. The CRM makes no model calls.

## One-time activation

1. Review and deploy the GitHub changes through the usual Vercel workflow. The existing server environment must have `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`. These credentials need Firestore read/write and Firebase Authentication user-read permissions. The MCP explicitly uses the same database ID as the browser CRM. Never put the service-account key in an agent folder.
2. Review the `firestore.rules` changes and deploy them to project **awebco-crm**, database **(default)**. GitHub/Vercel does **not** automatically deploy Firebase rules. From this repository, sign into Firebase and run:

   ```sh
   npx -y firebase-tools@latest deploy --only firestore:rules --project awebco-crm
   ```

   The changes keep the existing board queries, lock `_mcp` against every browser client, and prevent staff/freelancers from granting themselves admin roles. Master admins keep profile management; admins can manage workspace permissions and create non-master users; team members can edit their own display profile. Review any employer-specific user management needs before deploying. Existing public ticket creation is preserved for the current form integration.
3. **After** the rules are deployed, use the Firebase Console (or the Firebase MCP administrative tool) to create document `_mcp/config` in `(default)` with field `enabled` of type boolean set to `true`. Do not create this document before protecting `_mcp`. The absence of this field keeps the MCP disabled. Set it to `false` for an emergency stop.
4. Sign into the CRM as its **master admin**, open **Settings → AI agent connections**, and create a read-only connection. Copy the setup text immediately. Keys are shown once, expire after 90 days, and can be revoked here. Maximum 10 connections; revoke expired ones before replacing them.
5. Open `awebco-agent` in Codex and provide the copied setup text. It contains the real URL and a folder-local Codex configuration. Restart/reconnect Codex and call `crm_info`, then read a small page. Create a key with task edits enabled only when needed. Keep connection prompts out of shared documents and Git.

## Agent configuration

Codex supports a project-local `.codex/config.toml`. The copied setup text uses a private local Authorization header so it also works when the desktop app has not inherited shell environment variables. Restrict the file to the current user (`chmod 600`) and add `.codex/config.toml` to that folder's `.git/info/exclude` **before** saving the key. Preserve existing configuration. Prefer a native secret store/environment variable if your agent supports one:

```toml
[mcp_servers.awebco_crm]
url = "https://YOUR-CRM-DOMAIN/api/mcp"
bearer_token_env_var = "AWEB_CO_CRM_MCP_TOKEN"
default_tools_approval_mode = "writes"
```

An environment-based connection needs that variable available to the Codex process. Other agents that support Streamable HTTP and Bearer headers can use the same URL and key; this is a private key connection, not an OAuth/ChatGPT connector.

## Tools and safeguards

- `crm_info`: boards, subscriptions, status options and limits.
- `list_records`: tasks/tickets, companies, contacts or services; default 10 and maximum 25 records. One exact indexed filter, with cursor pagination. No listeners, scheduled polling, arbitrary queries or full exports. Client service flags live on company records. Use `workspace` for SEO/local listings/support, `parentId` for subtasks, or `companyId` to narrow a task search.
- `get_record`: a single record, its version, and up to 10 recent task updates. List responses omit long descriptions and notes.
- `update_task`: exposed only to write-enabled keys. Can edit status, deadline, priority and a plain-text description or append a progress note. Requires the current version and a UUID operation ID. The same ID retries the same operation without duplicating it. Changes use a transaction and retain the CRM's status/group behavior. Never deletes or creates tasks; never changes subscriptions, billing, clients or user accounts.

All keys share **100 protocol requests/day** and **25 task edits/day**, reset at midnight UTC. Startup counts toward the request cap. A shared Firestore transaction enforces the cap across Vercel instances. Successful edits have private audit events; they store a request digest, not note content. Read-only keys cannot reach a write tool. Revocation and the owner's role are checked on each request and again inside an edit transaction.

At maximum page sizes, admitted requests usually consume fewer than approximately **3,000 document reads/day**, plus authentication, retries, settings operations and rejected requests. Approximately 100 budget writes plus at most 75 task/budget/audit writes occur at the caps, excluding connection management. The cap limits admitted MCP work; it is not a hard cap on Firebase billing. Rejected requests with a previously valid key and transaction retries still cost reads. Other CRM activity continues to use its own quota. The existing Firebase/Vercel account plans and total usage determine actual costs; free operation cannot be guaranteed. Do not raise caps until usage is measured.

Keys are 256-bit random secrets with server authentication tags; forged keys are rejected before Firestore access. Only hashes are stored. The tag uses the existing server credential with a separate purpose prefix; rotating that credential invalidates all issued keys. Keys never allow direct Firebase access. Data projections omit passwords, payment fields, file links and unspecified custom fields. CRM text remains untrusted content: agents must ignore embedded instructions and must not send client data elsewhere. A bearer key authorizes whoever holds it; keep it private and revoke it if exposed. The endpoint is publicly routable but requires a valid credential; it is not a private network endpoint.

## Validation and rollback

Run `npm run test:mcp`, `npx tsc --noEmit --incremental false`, and `npm run build`. Rule syntax can be checked with the Firebase plugin's `firebase_validate_security_rules` tool. The provided rule behavior tests require the Firestore emulator and Java 21+: `npm run test:mcp:rules`. Run them before activation.

First live verification: create a read-only key, read one page and a record, revoke it, and confirm it stops working. Test edits on a designated disposable test task, not a client task. No live task changes are required to set up the server.

To stop agents immediately, set `_mcp/config.enabled` to false or revoke their keys. Removing the MCP routes/Settings panel rolls back the feature. Keep `_mcp` private; do not revert to broad rules while key/budget/audit records exist. Audit events persist for manual review; no TTL or paid cleanup job is enabled.

References: [Codex MCP configuration](https://developers.openai.com/codex/mcp/), [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x), [Vercel MCP hosting](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).
