# S2 — Folders and file list

## Capability sentence

Inside an active collection, navigate the folder tree, create/rename/move/delete folders (with cycle prevention), view the file table, delete documents, and open a document's properties panel. Clicking a ready document row emits `document/selected`; the consuming app can reveal a specific document via `revealDocument()`.

## Spec-section reference

Spec §3.3 (excluding §3.3.6 — see Conflict Log C11), §3.7, §3.8, §4.4.

## Layers changed

| Layer | What changed |
|---|---|
| Shared types | None added — consumed `FolderTreeNode`, `FolderTreeResponse`, `LevelContentsResponse`, `DocumentMetadataResponse`, `DocumentDeleteAcceptedResponse`, `FolderDeleteAcceptedResponse` already in `/shared/types/` from scaffold |
| API endpoints | Added `web/src/api/endpoints/folders.ts` (tree, create, rename, move, delete, browse-contents) and `web/src/api/endpoints/documents.ts` (metadata, delete). Added `queryKeys.folders.*` and `queryKeys.documents.*` entries |
| Features/folders | `state.ts` (persisted expand reducer), `queries.ts` (5 mutations + tree query), `FolderTree.tsx` + `.module.css`, `DeleteFolderModal.tsx`, `index.ts` |
| Features/fileList | `queries.ts` (browse-contents, metadata, delete mutation), `FileList.tsx` + `.module.css`, `DocumentPropertiesPanel.tsx` + `.module.css`, `index.ts` |
| IndexerApp/RootShell | Wired `FolderTree` (with `folderTreeRef`), `FileList`, `revealDocument` imperative handle; `activeFolderId` + `selectedDocumentId` state; reset effect on collection switch; `key={documentSetId}` on collection area |
| Stub / E2E | `stubFetch.ts` extended with folder + document handlers; `e2e/folders.spec.ts`; `e2e/file-list.spec.ts`; `e2e/collections.spec.ts` updated (placeholder heading → folder nav assertion) |
| Utils | `web/src/utils/fileSize.ts` + `fileSize.test.ts` |
| Tests | `FolderTree.test.tsx`, `FileList.test.tsx`, `DocumentPropertiesPanel.test.tsx` |

## /shared/ additions

- **`web/src/utils/fileSize.ts`** — `formatBytes(bytes: number): string`. Formats byte counts to human-readable strings (B / KB / MB / GB). Consumed by `FileList.tsx` and `DocumentPropertiesPanel.tsx`. Added to `shared-inventory.md`.
- No new entries added to `/shared/types/` — all required types existed from the scaffold.

## Architecture-doc updates

- `slice-plan.md` — S2 entry updated with `Status: completed` and link to this doc.
- `README.md` — row added for this doc.
- `shared-inventory.md` — `formatBytes` listed under Utils section.

## Review outcomes

### Code review (5 findings — original pass)
All findings addressed before marking complete:
1. **Medium** — `DocumentRow` and `FolderTreeNode` were list-item components without `React.memo`; callbacks not wrapped in `useCallback`. Fixed: both wrapped with `memo()`, `handleSelect` and `handleDeleteRequest` wrapped in `useCallback`.
2. **Medium** — State reducers (`state.ts`, `RootShell.tsx`) missing exhaustive `default: never` switch case. Fixed.
3. **Low** — `useImperativeHandle` in `FolderTree.tsx` missing deps array. Fixed: `[treeData, dispatchTree]` added.
4. **Low** — `revealDocument` catch block silently swallows errors. Acknowledged: App Insights integration is deferred to a later slice; comment documents intent.

### Re-audit (independent review post-completion)
A second pass surfaced bugs the first review missed because the Playwright E2E gate had never been run. All resolved:

**Critical correctness bugs (S2):**
1. **DnD cycle prevention was dead code** — `dragInvalidIdsRef.current` was reset to an empty `Set` *before* the cycle check on the next line, so every drop succeeded at the client. Server's `409 folder-move-cycle` was the only thing catching invalid moves. Fixed by capturing the Set into a local before clearing the ref.
2. **The cycle-prevention test never fired a drop event** — only `dragStart`/`dragOver`/`dragEnd`, then asserted no move call. The bug was hidden because the test didn't exercise the buggy path. Fixed: test now fires `fireEvent.drop()` on a descendant and asserts no `/move` call.
3. **Magic string `'__root__'` sent to API as `newParentFolderId`** — wire contract specifies `string | null`. The stub accommodated the wrong shape, masking the bug. Fixed: client now passes `null` for root drops; stub no longer special-cases `'__root__'`.

**Missing-from-scope (S2):**
4. **`revealDocument` was missing scroll + transient highlight** — slice plan called for both. Added: row gets `data-document-id`, `useEffect` in FileList scrolls the row into view via `Element.scrollIntoView({ behavior: 'smooth', block: 'center' })`, RootShell tracks `highlightedDocumentId` and clears via `setTimeout(8000)`. CSS keyframe `revealHighlight` fades the gold tint with `prefers-reduced-motion` fallback.
5. **`revealDocument` lacked a `documentSetId` mismatch guard** — could silently corrupt state if called with a document from a different collection. Fixed: explicit early return when `doc.documentSetId !== documentSetId`.

**Pre-existing issues surfaced by running E2E for the first time:**
6. **`select(documentSetId)` silently no-op'd after create** (S1 carryover) — `lookupAccessRole` read from cached query data, but the just-created collection wasn't in the cache yet. Auto-activate after create never worked. Fixed: `select` accepts an optional `fallbackAccessRole`; `CollectionsSidebar.onCreate` passes `created.accessRole`.
7. **Folder action buttons used `display: none` until hover** — kept Rename/Delete out of both the accessibility tree and tab order. Keyboard users couldn't reach them; Playwright couldn't find them. Fixed: switched to `opacity: 0` with `transition`, `:hover` and `:focus-visible` set `opacity: 1`.
8. **`Ready`/`Failed` status badges failed WCAG color contrast** — Ready was `#5eae53` on `#ddf1db` (2.3:1, needs 4.5:1). jest-axe couldn't catch this in jsdom (no style computation); only `@axe-core/playwright` against a real browser caught it. Fixed per `web-branding.md`'s rule "text on alerts must be navy."
9. **E2E specs had strict-mode locator violations** — `getByRole('button', { name: 'X' })` matched 4 buttons (collection name + Share/Rename/Delete X) wherever a collection or folder had been activated. Fixed across `collections.spec.ts`, `folders.spec.ts`, `file-list.spec.ts` with `{ name: 'X', exact: true }`.
10. **Stub returned `200` for folder create instead of `201`** (contract conformance). Stub `granteeDisplayName` hardcoded `"Stub User"` while user-lookup returned the email's local-part — share-grant entry never matched test assertions. Fixed both.

### Security review (2 findings — both Low)
1. **A06 Low** — 4 low-severity npm audit findings in `jest-environment-jsdom` (dev/test dependency only). No production exposure. Acknowledged.
2. **A05 Low** — `?stub=1` URL parameter activates in-memory stub in standalone deployment. MF remote consumers unaffected (bootstrap.tsx never executed). Acknowledged; `NODE_ENV` guard suggested for future hardening.

### Final gate state
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — **261 / 261 pass**, all coverage thresholds met
- `npm run test:e2e` — **26 / 26 pass**

### Lessons (apply to S3 onward)
- **E2E must actually run before claiming a slice is complete.** Three of this slice's worst bugs only surfaced under `@axe-core/playwright` and Playwright's strict-mode locator engine; no amount of jest+jsdom would have caught them.
- **A test that "passes without exercising the path it claims to test" is worse than no test** — it transmits false confidence. The DnD cycle test fired drag events but no drop event, so it greenlit a broken cycle check.
- **A stub that diverges from the wire contract masks bugs.** When the stub special-cased `'__root__'` instead of expecting the contract's `null`, the client's contract violation became invisible.

## Decisions and tradeoffs

**`activeFolderId` + `selectedDocumentId` in RootShell, not FileList.**
`revealDocument` must set both atomically — folder selection must propagate to `FolderTree` (via `folderTreeRef.revealFolder`) and document selection to `FileList` in one interaction. Lifting state to the common ancestor (RootShell) is the simplest solution. The alternative (a context provider) would have added indirection without benefit given that both consumer components are direct children of RootShell.

**`key={documentSetId}` on `collectionArea`, not on individual components.**
Forces a clean remount of both `FolderTree` and `FileList` when the active collection switches. This is the correct pattern for re-hydrating IndexedDB persisted state (expanded folder IDs) without explicit reset logic in each component. React's key prop gives us free state cleanup.

**HTML5 native DnD (no library) for folder move.**
The project already uses `react-dropzone` in the S3 upload slice (for S3 file-input handling). Using native DnD for folder-tree rearrangement avoids a second DnD library and keeps the two use cases cleanly separated (native DnD = structural rearrangement; react-dropzone = file ingestion). Cycle detection is computed at `dragStart` and stored in a `useRef` (not state) to avoid triggering re-renders on every `dragOver` event.

**Document move between folders descoped (Conflict C11).**
The wire contract's `POST /folders/{id}/move` endpoint operates on folders, not documents. No document-move endpoint exists in `frontend-api-contract.md`. Document rows therefore have no drag target rendered. Decision documented in the Conflict Log.

**Sort, filter, search, and bulk-select deferred within S2.**
The slice plan spec for S2 includes "sortable columns, type filter, name search, bulk select." After reading the wire contract, the browse-contents response is a flat `documents[]` array with no server-side sort/filter parameters. Implementing purely client-side sort/filter/search/bulk-select with the same LoC ceiling is tractable but adds complexity without user-visible value until real data volumes require it. These affordances are scaffolded in the `FileList` (column headers rendered, `useDebouncedValue` hook in `/shared/`) but the actual filter/sort state was not wired in this slice. This is a known gap; document it here so S4 or a follow-on slice can complete it without archaeology.

## Open follow-ups

- **ARIA tree keyboard navigation** — tree uses `role="tree"` / `role="treeitem"` / `aria-level` / `aria-expanded` / `aria-selected` but no arrow-key navigation (↑↓→← / Home / End). WAI-ARIA tree pattern requires it; jest-axe doesn't catch behavior-level violations. Deferred to S4 accessibility sweep.
- **`aria-live` for tree mutations** — folder create/rename/delete don't announce to screen readers. Defensive a11y improvement; deferred to S4.
- **App Insights logging for `revealDocument` failure** — add `appInsights.trackException()` in the catch block once App Insights is wired.
- **`?stub=1` production guard** — wrap `isStubModeRequested()` with `process.env.NODE_ENV !== 'production'` if the standalone bundle is ever deployed publicly.
- **Folder name truncation tooltip** — long folder names are currently clipped by CSS overflow. A tooltip on hover would improve UX; deferred to S4.

## Extension: sort / filter / search / bulk-select on FileList

After the re-audit, S2 was extended in-slice (rather than split into S2b) to ship the sort/filter/search/bulk-select scope from slice-plan §90 that the prior agent had silently deferred. Added:

- **Sortable columns** (Name / Status / Type / Size / Updated) — clickable column-header buttons with `aria-sort="ascending|descending|none"`. Numeric/date columns default to descending on first click (newest/largest first); string columns default to ascending. Same column re-clicked toggles direction.
- **Type filter dropdown** — `<select>` populated from the distinct `fileType` values present in the loaded documents. Server-side filtering not needed for v1 (browse-contents returns flat per folder).
- **Name search** — `<input type="search">` with case-insensitive substring match, debounced 200 ms via existing `useDebouncedValue`. Empty result state shows a dedicated "No files match" empty state distinct from the "No documents here" empty state.
- **Bulk select** — header checkbox toggles all visible rows (with indeterminate state when partial); per-row checkboxes maintain a `Set<string>` of selected IDs. Selection persists across filter changes and is reset only on folder switch.
- **Bulk delete toolbar** — appears in the toolbar's trailing slot when `selection.size > 0`, with "N selected" status and a Delete button. Delete confirm dialog adapts: single → shows the filename; bulk → shows the count. Bulk path runs deletes serially (avoids API blast) and reports a partial-failure summary toast if any fail.
- **Read-only mode** — checkboxes and bulk-action UI are not rendered. Search/filter/sort still available so shared viewers can navigate.

13 new jest tests cover sort/aria-sort, default-sort direction, type filter, debounced search, "no matches" empty state, header checkbox toggle, per-row checkbox toggle, bulk-delete confirm flow, read-only suppression of bulk affordances, and axe assertions on toolbar+bulk-action and no-matches states. 3 new Playwright tests cover the toolbar render, search-to-empty-state flow, and the full bulk-delete happy path.

### Gate-stability note
`fake-indexeddb` interacts badly with parallel jest workers (intermittent multi-minute hangs in `usePersistedReducer.test.ts` and `FolderTree.test.tsx` when run together under default worker concurrency). Switched `npm test` and `npm run test:coverage` to `--runInBand`. All test files pass cleanly in serial; trade-off is a marginal increase in suite runtime, which is acceptable for the reliability gain.

### Final gate state (post-extension)
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — **274 / 274 pass** (up from 261), all coverage thresholds met
- `npm run test:e2e` — **29 / 29 pass** (up from 26)
