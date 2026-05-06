# Slice Plan — Reusable Indexer (Frontend)

Slicing follows `.claude/rules/slicing.md`. A slice is one user-visible capability shipped end-to-end, not a horizontal layer.

The reusable indexer ships **ingestion + collection management only** — upload, collections, folders, file list, processing visibility, failure triage. Chat, citations, and the document viewer are the consuming application's responsibility; the indexer supports them through its host contract. That scope cut is what brings this plan from 6 slices down to **4**.

## Project-level tuning (from `slicing.md`)

- **Target slice count:** **4 slices**.
  - The indexer's in-scope capability set is ~14 items (collections list/CRUD/share/switch/persist, folder tree/CRUD/move, file list with sort/filter/search/bulk select, properties panel, drag-drop/picker upload, processing visibility, failure triage, browser-close guard, theme toggle, responsive/a11y polish).
  - At ~0.3× capability count = 4. Below 1× because most capabilities cluster naturally (folder CRUD belongs with folder browsing; per-file/per-folder status belongs with the upload that produces them; collection sidebar pairs with the host-contract surface that exposes "active collection").
  - Going lower than 4 would create slices that fail the "ships in different weeks without breaking each other" test (e.g., folding upload's many sub-features into the file-list slice).
  - Going higher than 4 invites the "two adjacent slices edit the same file" smell, especially across upload's drag-drop / status / triage subdivisions.

- **Reviewable size ceiling:** **6,500 LoC** per slice, including tests.
  - Sits in the middle of slicing.md's 5,000–8,000 band.
  - Not a security/regulated project (no payment processing, no PHI), but does handle PII (user document metadata + uploaded content) so leaning conservative.
  - Greenfield React + already-scaffolded shell, so cost-of-change is low — a moderate ceiling keeps any single review tractable.

- **Drift cap:** *slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review.*
  - 25% of 4 = 1 → up to **5 slices** before re-review.
  - Splitting S3 (Upload) is the most plausible expansion if the drag-and-drop folder walk + failure triage outgrows one slice; budget that as the explicit fallback.

---

## Capability-to-slice map

Spec capabilities and where they ship. Items marked **(consuming app)** are out of indexer scope — listed here only for traceability.

| # | Capability | Spec ref | Slice |
|---|---|---|---|
| 1 | Indexer renders inside a host application | spec §1, "Module Federation" lead-in | S1 |
| 2 | List collections in sidebar | 3.2.1 | S1 |
| 3 | Create / rename / delete collection | 3.2.2 / 3.2.3 / 3.2.4 | S1 |
| 4 | Switch active collection (with upload-in-progress guard) | 3.2.5 | S1 (guard finalized in S3) |
| 5 | Share collection (read-only viewer) | 3.2.6 | S1 |
| 6 | Persist last-active collection / sidebar state | 3.2.1, 5.3 | S1 |
| 7 | Theme toggle (light/dark, OS preference, persisted) | 5.2, 5.3 | S1 |
| 8 | Outbound host contract — `collection/activated`, `collection/list-changed` events; `selectCollection` ref method | (host contract) | S1 |
| 9 | Browse folder tree | 3.3.1 | S2 |
| 10 | Create / rename / move / delete folders (cascade) | 3.3.2–3.3.5 | S2 |
| 11 | View file table with sort, type filter, name search, bulk select | 3.7.1, 3.7.2, 4.4.1 | S2 |
| 12 | Open document properties panel | 3.7.3 | S2 |
| 13 | Empty states for collections / files / filters | 3.8 | S1 (collections) / S2 (files & filters) |
| 14 | Outbound host contract — `document/selected` event; `revealDocument` ref method | (host contract) | S2 |
| 15 | Drag-drop / picker / folder-walk upload | 3.4.1, 3.4.5 | S3 |
| 16 | Per-file status, per-folder aggregate status, progress banner | 3.5.1–3.5.3 | S3 |
| 17 | Browser close guard during upload | 3.5.4 | S3 |
| 18 | Failure triage (popover, severity, per-row retry/dismiss) | 3.6.1–3.6.4 | S3 |
| — | Chat panel (panel, input, streaming, history, follow-ups, sources) | 4.2 | **(consuming app)** |
| — | Citation markers, audit, click-through | 4.3 | **(consuming app)** |
| — | Document viewer (PDF / image / text rendering, page nav, citation highlight) | 4.5 | **(consuming app)** |
| 19 | Read-only viewer mode hides all mutating affordances in the indexer | 4.6, 2.1 | S4 |
| 20 | Responsive layout (desktop / tablet / mobile) for the indexer's surface | 5.1, 5.3 | S4 |
| 21 | Move documents between folders | 3.3.6 | **Descoped — Conflict C11.** Spec is unimplementable against the wire contract. Not rendered in v1. |

Every in-scope spec requirement maps to at least one slice. Out-of-scope items are explicitly listed so reviewers can confirm the cut.

---

## S1 — Indexer shell, theme, and collections

- **Spec sections:** 1, 2, 3.2 (all sub-sections), 5.2, 5.3, 5.5, 5.6, 5.7
- **User capability:** *"Mount the indexer inside a host app, sign in via the host, see my collections, create/rename/delete/share/switch them, and have the theme and last-active collection persist. The host receives `collection/activated` and `collection/list-changed` events and can drive selection via `selectCollection()`."*
- **Scope:**
  - Module Federation Webpack config (`@module-federation/enhanced`); `bootstrap.tsx` async boundary; expose `./IndexerApp` (forwardRef) and `./types`.
  - Host contract wired up: `HostContext`, `useHost`, `stubHost`, App Insights bridging, `IndexerEvent` emission for `auth/expired`, `collection/activated`, `collection/list-changed`, `error/unhandled`.
  - `IndexerHandle.selectCollection` exposed via `useImperativeHandle`.
  - HTTP client (`api/client.ts`), TanStack Query setup, `queryKeys.ts`, `api/endpoints/collections.ts`.
  - Theme — tokens, `ThemeProvider`, `prePaintScript`, light/dark toggle, persistence in `localStorage` (theme only).
  - IndexedDB plumbing (`utils/idb.ts` + `usePersistedReducer`).
  - Toast, Modal, Button, IconButton, Pill, EmptyState, Skeleton, ErrorBoundary (relocated). Phosphor icons added.
  - `features/collections/` — sidebar, list query, create/rename/delete mutations with optimistic updates, share dialog using `POST /users/lookup` + `POST /shares`, read-only badge styling, last-active persistence, sidebar collapse state.
  - Empty-state copy for "No collections yet."
  - Collection-switch guard scaffolded (real upload signal lands in S3 — until then, the guard is dormant).
  - Playwright e2e: `collections.spec.ts` covers create → rename → share → switch → delete, plus a host-event assertion (mounts the indexer with a stub host that records `IndexerEvent`s; asserts the right events fire). axe scan on each state.
- **Endpoints:** `POST /document-sets`, `POST /document-sets/list`, `GET /document-sets/{id}`, `PATCH /document-sets/{id}`, `DELETE /document-sets/{id}`, `POST /users/lookup`, `POST /document-sets/{id}/shares`, `POST /document-sets/{id}/shares/list`, `DELETE /document-sets/{id}/shares/{granteeUserId}`.
- **Events emitted:** `auth/expired`, `error/unhandled`, `collection/activated`, `collection/list-changed`.
- **Imperative API exposed:** `selectCollection`.
- **Estimated LoC:** **5,500** (foundation has fixed cost; the host contract surface is non-trivial).
- **Status:** completed (see [`docs/architecture/01-slice-shell-collections.md`](./01-slice-shell-collections.md))

## S2 — Folders and file list

- **Spec sections:** 3.3 (excluding 3.3.6 — see C11), 3.7, 3.8, 4.4
- **User capability:** *"Inside an active collection, navigate the folder tree, create/rename/move/delete folders, view the file table with sort/filter/search/bulk select, and open a document's properties panel. Clicking a ready document row emits `document/selected` so the consuming app can open its viewer."*
- **Scope:**
  - `features/folders/` — `GET /folders` for the full tree, browse via `POST /contents`, create / rename / move (drag-drop with cycle prevention) / delete (cascade-only, with the "Lift" affordance explicitly **not** rendered — see Conflict Log C5). Folder expand/collapse persisted per `(user, collection)`.
  - Folder-tree drop targets validated against `409 folder-move-cycle`.
  - `features/fileList/` — sortable columns (Name / Type / Pages / Date — Pages renders `—` per C8); type filter dropdown derived from documents present; case-insensitive substring filename filter (debounced via `useDebouncedValue`); header + per-row checkboxes; bulk-delete toolbar (owner only) using `DELETE /documents/{id}` per row; document properties panel (the data the API actually returns — see C8).
  - Empty states: "No files yet," "No files match — try a different filter or search term."
  - Click on a ready file row emits `IndexerEvent('document/selected')` upward via `RootShell`. The indexer **does not** open a viewer.
  - `IndexerHandle.revealDocument` exposed — when called by the consuming app, opens the document's parent folder, scrolls the row into view, and applies a transient highlight.
  - Move-document-between-folders (spec 3.3.6) is **descoped** pending API support — see Conflict Log C11. The drag-target on document rows is not rendered.
  - Playwright: `folders.spec.ts`, `file-list.spec.ts` (including `document/selected` event assertion via stub host). axe on every state.
- **Endpoints:** `GET /document-sets/{id}/folders`, `POST /document-sets/{id}/folders`, `POST /document-sets/{id}/contents`, `PATCH /folders/{id}`, `POST /folders/{id}/move`, `DELETE /folders/{id}`, `GET /documents/{id}`, `DELETE /documents/{id}`, `PATCH /documents/{id}` (fileType only).
- **Events emitted:** `document/selected`.
- **Imperative API exposed:** `revealDocument`.
- **Estimated LoC:** **5,000**.
- **Status:** completed (see [`docs/architecture/02-slice-folders-filelist.md`](./02-slice-folders-filelist.md))

## S3 — Upload pipeline

- **Spec sections:** 3.4, 3.5, 3.6
- **User capability:** *"Drag a folder of files onto a collection, watch each file progress through the pipeline, see aggregate status per folder, recover from failures, and not be allowed to navigate away mid-upload without confirmation."*
- **Scope:**
  - `features/upload/` — `<UploadDropzone />` with drag-over highlight, native picker (`<input type="file" multiple>`), DataTransferItem entry walk for folder drops (`webkitGetAsEntry`).
  - `utils/junkFileFilter`, `utils/fileTypeFilter`, `utils/folderPath`.
  - Sliding window of 5 concurrent `POST /documents` per `web-document-upload.md`. Batch is created lazily on first file via `POST /batches`. `/complete` called once after the last submit.
  - Status polling via `usePolling` against `POST /batches/{id}/status` (cadence per `web-document-upload.md`), paused on tab hidden.
  - Per-folder aggregate status with `<Pill>` and progress bar, computed from polled statuses.
  - `<UploadProgressBanner />` anchored to bottom of viewport, collapsible, with per-row table when expanded; "View" jumps to source collection (calls `selectCollection`); auto-dismisses post-completion.
  - Browser close guard (`beforeunload`) while a batch is in flight.
  - Collection-switch guard fully wired (S1's scaffolding takes its first real signal here).
  - `<FailedFilesPopover />` on per-folder badge click; per-row Retry / Dismiss; bulk Retry all / Dismiss all; severity styling (yellow Skip vs red Fail).
  - Playwright: `upload.spec.ts` covers happy-path 50-file drop, oversize/unsupported rejection, mid-upload tab-close prompt, retry of a transient failure.
- **Endpoints:** `POST /document-sets/{id}/batches`, `POST /documents` (multipart), `POST /document-sets/{id}/batches/{batchId}/complete`, `POST /document-sets/{id}/batches/{batchId}/status`.
- **Events emitted:** none new (existing `collection/list-changed` fires when documents land).
- **Estimated LoC:** **6,000** (close to the ceiling — first candidate to split on drift; see drift cap notes below).
- **Status:** completed (see [`docs/architecture/03-slice-upload.md`](./03-slice-upload.md))

## S4 — Read-only mode polish, responsive layout, accessibility sweep

- **Spec sections:** 2.1 (final pass), 4.6, 5.1, 5.3, 5.4, 5.5
- **User capability:** *"As a read-only viewer, see no mutating controls anywhere in the indexer; use the indexer comfortably on tablet and mobile; navigate the whole indexer surface by keyboard."*
- **Scope:**
  - Read-only sweep across S1–S3 surfaces: every mutating affordance gated by `accessRole === 'Owner'`, hidden (not disabled) in shared-collection context. Spec 2.1 wording. The `accessRole` is also surfaced on `collection/activated` so the consuming app can mirror this in its own chat / viewer UI.
  - Responsive layout for the indexer: desktop sidebar + main pane; tablet collapsible sidebar; mobile single-pane stack with hamburger entry to the sidebar. The indexer does not render a chat or viewer panel, so no splitter.
  - Keyboard pass: tab order, Enter to confirm in dialogs, Escape behavior across upload-progress panel and modals.
  - Accessibility sweep: ARIA live regions for drag-target highlight and batch-progress banner. Tooltips on truncated names. Status pills carry text labels.
  - Playwright: `accessibility.spec.ts` runs `@axe-core/playwright` across each major page state (collections list, file list with filter open, upload mid-flight). `responsive.spec.ts` covers desktop/tablet/mobile breakpoints. `read-only.spec.ts` covers the indexer's surface under a shared collection.
- **Endpoints:** none new.
- **Events emitted:** none new.
- **Estimated LoC:** **2,500**.
- **Status:** completed (see [`docs/architecture/04-slice-readonly-responsive-a11y.md`](./04-slice-readonly-responsive-a11y.md))

---

## Drift cap

> Slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review.

25% of 4 = 1 → maximum **5 slices** without re-review. The most plausible expansion path:

- **S3a / S3b split** if the upload pipeline outgrows the ceiling. Natural cut: S3a = drag-drop / walk / batch / per-file polling; S3b = aggregate folder status / progress banner / browser close guard / failure triage popover. Both still ship a working capability end-to-end (S3a alone delivers "I can upload files and see them indexed").

Any other split crosses the drift cap — pause, update this doc, re-review.

---

## Cross-cutting checklist

- **Tests ship in the slice that introduces them.** No "tests for slice 2 in slice 4." This is the "Always" tier of the Pre-Implementation Checklist (`CLAUDE.md`).
- **80% coverage from real-behavior tests** per `web/CLAUDE.md`. Each slice is gated on `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run test:e2e`.
- **Every component test runs `jest-axe` on each meaningfully different rendered state** (loading, error, empty, disabled, open/closed) — `web/CLAUDE.md`.
- **No new dependency installed without a `web-dependency-security.md` audit.**
- **Telemetry:** every slice instruments App Insights for its key user actions (upload submit, collection switch, document selected, share grant). PII never leaves the device — `api-pii-handling.md`.
- **Host contract testing:** every slice that emits a new `IndexerEvent` or exposes an `IndexerHandle` method has a Playwright test that mounts the indexer with a stub-host harness and asserts the contract — events fire with the right payloads, ref calls produce the right state changes.

---

## Conflict Log cross-reference

The full Conflict Log lives in `data-model.md` §5. After the scope was clarified to ingestion-only, the chat / citation / viewer entries (C1, C2, C3, C4, C7, C9, C12) became out-of-indexer-scope. The remaining live conflicts (C5, C6, C8, C11) affect the indexer's surface and are resolved for v1 by descoping the affected affordance until the API is extended:

- **C5** — folder cascade-only (no lift mode in v1).
- **C6** — 7-state file display, not the spec's 12.
- **C8** — `—` for page count, filing date, friendly title, classification confidence.
- **C11** — document drag between folders not rendered in v1.

None block the slice plan from shipping.
