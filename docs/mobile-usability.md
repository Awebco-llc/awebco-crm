# Mobile usability changes

Based on GitHub main `d297b4d`. Work is isolated on `codex/mobile-usability` in the sibling `awebco-crm-mobile` checkout. Nothing has been deployed.

## Changes

- Phones below 768 px open a compact workspace board. Task names, status, company, priority, due date and assignees wrap within the screen. Subtasks expand in place, including deeper ancestry. Task and subtask buttons open the existing editor and use its existing write handlers.
- Creating a task or subtask on a phone opens the new record for editing. Support cards have a Client reply button that opens the existing client conversation in either editor mode, without enabling sharing automatically.
- Full table remains available on phones for bulk selection, exports, group actions, columns, sorting and drag operations. Desktop keeps its existing table.
- Search input updates immediately while expensive filtering can render at lower priority. A memoized parent index replaces repeated full-board scans for child counts, statuses and expansion. Compact mode does not mount the table's drag-and-drop tree.
- Main sections load on demand with a loading indicator. Firestore subscriptions, permissions, support APIs and notification rules are unchanged.
- My Tasks reflows its existing list and status controls into cards on phones. Inbox shows either the conversation list or the selected chat, with a back button; an unopened mobile chat is not marked read.
- Mobile controls have larger targets, inputs avoid Safari focus zoom, and the shell and editors use the dynamic viewport height. Less-used board tools remain accessible under More. Active editor tabs scroll into view.

## Verification

The latest GitHub build and changed build used the same lockfile, Node version and dependency installation.

| Measurement | GitHub main | Mobile branch |
| --- | ---: | ---: |
| Next.js initial First Load JS for `/` | 599 kB | 306 kB |
| Home route size | 373 kB | 80.5 kB |

Initial JS is about 49% smaller. Selected-screen chunks still load when those screens open; these numbers are not a measured physical-device speedup.

For a disposable board with 50 support tickets (49 parents and one child), at 390 × 844, the compact UI had 1,085 DOM elements versus 4,425 in full-table mode, about 75% fewer. No page-level horizontal overflow was observed at 320 × 568 or 390 × 844. The full table scrolls horizontally within its own container.

1. Board browsing: passed compact/full-table switching, group/task visibility, subtasks, small-phone layout and availability of additional tools.
2. Task/subtask creation and editing: passed with disposable in-memory records using the real UI components and existing handlers. Renamed a subtask, changed its status, closed the editor and verified the updated board record.
3. Client conversation: passed direct opening and reply submission through an isolated local support API, including the cleared composer and saved reply. The full-screen editor's conversation also opens. No live client messages were sent.
4. My Tasks: passed visual reflow at 320 px with the existing status controls present.
5. Inbox: passed opening a conversation, fitting the composer within the screen, and returning to the conversation list.

Production build and TypeScript checks pass. All 98 existing non-emulator regression tests pass:

```sh
node --import tsx --test tests/support.test.ts tests/supportEmail.test.ts tests/portal-listings.test.ts tests/extension-listings.test.ts tests/portal-seo.test.ts tests/portal-seo-groups.test.ts tests/portal-seo-automatic.test.ts tests/portal-seo-publications.test.ts tests/mcp.test.ts
npm run build
```

Focused ESLint checks pass for the new hook, new board, Inbox and SupportConversation, with one pre-existing image warning. Comparison against main confirms the existing React purity error in `app/page.tsx` and state-in-effect error in `MyTasksView.tsx` are unchanged. The production build retains the existing Firebase/protobuf dynamic-dependency warning. Firestore emulator security tests were not run; rules and server code were not changed.

## Evidence and limits

Screenshots and build/lint logs from this run are saved locally under `/tmp/awebco-mobile-review/`. Screenshot 01 is the live board before changes; remaining screenshots use only disposable sample data. The local preview uses real application components with test-only in-memory store/auth modules and a loopback support API, outside the production source tree. It does not bypass production authentication or connect to live Firestore.

These checks do not establish physical iPhone/Safari performance, virtual-keyboard behavior, real mobile network timings, binary attachment delivery, email delivery or a complete accessibility certification. Before release, exercise the preview on an actual phone and spot-check desktop drag, bulk export, files and notifications using an appropriate test account. No schema, API, rules or production data migration is required.

Implementation references: [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading) and [React deferred values](https://react.dev/reference/react/useDeferredValue).

## Screenshots from this run

| Step | Evidence |
| --- | --- |
| 1. Existing phone board | [Before](/tmp/awebco-mobile-review/01-board-before.png) |
| 1. Compact board | [After](/tmp/awebco-mobile-review/02-compact-board.png) |
| 1. Small phone | [320 px layout](/tmp/awebco-mobile-review/04-small-phone.png) |
| 2. Subtask editing | [Editor](/tmp/awebco-mobile-review/05-subtask-editor.png) |
| 3. Client replies | [Saved test reply](/tmp/awebco-mobile-review/03-client-reply.png), [full screen editor](/tmp/awebco-mobile-review/08-full-screen-conversation.png) |
| 4. My Tasks | [Task list](/tmp/awebco-mobile-review/06-my-tasks.png) |
| 5. Inbox | [Conversation](/tmp/awebco-mobile-review/07-inbox.png) |
| Desktop check | [Original table layout](/tmp/awebco-mobile-review/09-desktop.png) |
