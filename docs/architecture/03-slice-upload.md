# Slice 03 — Upload pipeline

**Status:** completed
**Spec sections:** 3.4, 3.5, 3.6
**Date:** 2026-05-06

## Capability sentence

*Drag a folder of files onto a collection, watch each file progress through the pipeline, see aggregate status per folder, recover from failures, and not be allowed to navigate away mid-upload without confirmation.*

## Spec-section reference

Spec §3.4 (upload methods, allowlist, limits, drag-over, folder walk, pin to active collection), §3.5 (per-file lifecycle, per-folder aggregate, progress banner, browser-close guard), §3.6 (humanized errors, failed-file popover, severity, per-row actions).

## Layers changed

| Layer | What changed |
|---|---|
| Migrations / DB / API | none — frontend-only project |
| Shared types | none added — `UploadFile`, `UploadSessionState`, `FailureSeverity`, `FolderAggregateStatus` already locked in `shared/types/domain.ts` from Step 1; consumed unchanged |
| `/shared/` utilities | promoted four signature stubs to real implementations: `junkFileFilter`, `fileTypeFilter`, `folderPath`, `usePolling` (each with colocated tests) |
| API endpoints | new `web/src/api/endpoints/batches.ts` — `createBatch`, `completeBatch`, `getBatchStatus`, `uploadDocument` (multipart) |
| `features/upload/` | `state.tsx` (reducer + `UploadProvider` + helpers), `aggregates.ts` (pure derived state), `folderEntryWalk.ts` (`webkitGetAsEntry` walker + picker normaliser), `useBeforeUnloadGuard.ts`, `useUploadController.ts` (orchestration: gate → batch lifecycle → sliding-window upload → /complete → polling → retry/dismiss → indexed-fade), `UploadDropzone.tsx` + `.module.css`, `UploadProgressBanner.tsx` + `.module.css`, `FailedFilesPopover.tsx` + `.module.css`, `index.ts` barrel |
| `IndexerApp/Providers.tsx` | wraps children in `<UploadProvider />` so the controller can read state from anywhere in the tree |
| `IndexerApp/RootShell.tsx` | renders the `<UploadDropzone />` wrapper around the collection area, the `<UploadProgressBanner />` anchored to the viewport bottom, and a `<FailedFilesPopover />` portal; threads `uploadInProgress` to `CollectionsSidebar`, `aggregateStatuses` + `onFailureBadgeClick` to `FolderTree`; calls `useBeforeUnloadGuard(controller.isInFlight)` |
| `features/folders/FolderTree.tsx` | accepts new `aggregateStatuses?: Map<string \| null, FolderAggregateStatus>` and `onFailureBadgeClick?` props; renders a `<Pill>` per folder when the upload session has work in that folder; failure badges become buttons that open the popover. Recursive node + root-level item both surface the pill |
| `features/folders/FolderTree.module.css` | added `aggregateBadge`, `aggregateBadgeButton`, `rootItemWrapper` rules |
| `host/stubFetch.ts` | added handlers for `POST /document-sets/{id}/batches`, `POST /batches/{id}/complete`, `POST /batches/{id}/status`, multipart `POST /documents`. Server-side status progresses Pending → Indexing → Ready over successive polls. Test hooks via `window.__stubControls` (`failNext`, `failNextWith`) drive the retry path |
| `eslint.config.mjs` | added a feature-scoped `no-restricted-imports` block for `src/features/upload/**`; extended sibling feature blocks to forbid imports from `upload/**` |
| `jest.config.ts` | removed the four future-slice stub files from `collectCoverageFrom` exclusions |
| Tests (jest) | colocated `.test.ts(x)` for each of the four promoted utilities/hooks, plus `state`, `aggregates`, `folderEntryWalk`, `useBeforeUnloadGuard`, `useUploadController`, `UploadDropzone`, `UploadProgressBanner`, `FailedFilesPopover`. Every component test runs `jest-axe` across each meaningfully different state |
| Tests (Playwright) | `e2e/upload.spec.ts` — happy-path PDF upload, oversize rejection (50 MB+ via temp file), unsupported-extension classification, transient-failure retry path, browser-close guard fires, switching collections during upload, axe scan with banner expanded |

## /shared/ additions

This slice ships **no new entries** in `shared-inventory.md` — it consumes the four scaffolded stubs that were declared in Step 1 and promoted them in place:

- `web/src/utils/junkFileFilter.ts` — drops `.DS_Store`, `thumbs.db`, `desktop.ini`, `.localized`, `.Spotlight-V100`, `.Trashes`, `.fseventsd`, and `._*` resource forks. Strips path separators before checking.
- `web/src/utils/fileTypeFilter.ts` — `classify(file)` returns `supported | unsupported | too-large | empty` with the wire content type, the default `FileTypeCode`, and a 50 MB cap.
- `web/src/utils/folderPath.ts` — walks a relative path against the live folder tree, creating missing intermediates via the supplied `createMissing` callback. Mutates the cloned tree in place so sibling files in the same drop reuse newly-created folders.
- `web/src/hooks/usePolling.ts` — fixed-interval poller with re-entrancy guard, pause-on-hidden + immediate-resume on visibility return, swallows `fn()` errors so transient failures don't kill the loop.

The upload feature's own internals (`state.tsx`, `aggregates.ts`, `folderEntryWalk.ts`, `useUploadController.ts`, `useBeforeUnloadGuard.ts`) are intentionally feature-local — none are imported by other features and no other feature would benefit from them.

## Architecture-doc updates

- [`slice-plan.md`](./slice-plan.md) — S3 marked `Status: completed` with link to this doc.
- [`README.md`](./README.md) — row added for this doc.
- [`shared-inventory.md`](./shared-inventory.md) — S3 update note added; the four S3 stubs (junkFileFilter, fileTypeFilter, folderPath, usePolling) flagged real.

No locked signatures (`IndexerAppProps`, `IndexerEvent`, `IndexerHandle`, `ThemeTokenKey`) moved.

## Decisions and trade-offs not visible from the diff

- **Polling cadence pinned to 2 s.** The wire contract says "every few seconds, do not back off"; `web-document-upload.md` left the number open. 2 s is the standard quiet cadence — cheaper than 1 s, snappier than 5 s. Centralised in a single constant in `useUploadController.ts` (`POLLING_INTERVAL_MS`) so future tuning is one edit.
- **Concurrency window pinned to 5.** Matches the template default in `web-document-upload.md`. Centralised in `CONCURRENT_UPLOADS`.
- **Indexed-fade kept at 8 s.** Matches the per-row spec 3.5.1 fade. The fade *removes* the row from the upload session view (it stays in the file list); avoids the banner table accumulating "Indexed" rows over a long session.
- **No `react-dropzone`.** S2's slice doc speculated about it; package was never installed. Native HTML5 DnD + `<input type="file" multiple [webkitdirectory]>` covers every flow including folder walk via `webkitGetAsEntry`. Avoided a `web-dependency-security.md` audit and a new dep on each consuming app.
- **Wire-allowlist over spec-allowlist.** Spec 3.4.2 lists a broader set (`.txt`, `.csv`, `.gif`, `.webp`, `.svg`, `.rtf`, `.md`, `.log`, `.doc`, `.xls`); the API contract narrows to PDF, JPEG/PNG/BMP/TIFF/HEIF, .docx, .xlsx, .pptx, text/html. **Contract wins** — files outside the wire allowlist are surfaced as `Unsupported` (yellow Skip severity per 3.6.3) and never sent. Spec discrepancy logged here for the next product review.
- **Cross-feature data flow stays via `RootShell`.** Per `dependency-graph.md`, `features/folders/`, `features/fileList/`, and `features/upload/` may not import each other. The upload-derived `aggregateStatuses` map is computed in `RootShell` from `useUploadState()` and passed down to `FolderTree` as a prop. The failure-popover is anchored at `RootShell` level (so it can sit above both panes) and its callbacks bind to the controller. ESLint enforces this with `no-restricted-imports` per feature folder.
- **`as` casts on the FileSystem entry types.** `webkitGetAsEntry` is non-standard and missing from the project's TS lib. `folderEntryWalk.ts` declares structural shapes (`FsFileEntryShape`, `FsDirectoryEntryShape`) and casts to them at the boundary — every cast has a comment explaining why and is local to the walker. No `any`, no `@ts-ignore`.
- **State.tsx aggregateStatus uses BatchStatus, not the data-model.md prose label set.** `data-model.md §2.1` describes UploadSessionState aggregateStatus as `'Idle' | 'Uploading' | 'Completing' | 'Completed' | 'CompletedWithErrors' | 'Failed'`, but the locked TypeScript type in `shared/types/domain.ts` is `BatchStatus | 'Idle' | 'Failed'` (i.e. uses the wire `Pending` / `InProgress`). Aligned with the locked type. Will note in the next architecture review pass to keep the prose synchronised — trivial to update.
- **`__stubControls` for Playwright determinism.** Triggering a transient failure in the e2e suite cleanly required telling the in-memory stub to fail the next `POST /documents` call. Exposed `window.__stubControls = { failNext, failNextWith }` only inside `installStubFetch()` (which only runs when `?stub=1` is in the URL — i.e., the standalone dev shell, never the consumer-loaded MF entry). Acknowledged Low risk per the same security note in S2's slice doc.
- **Browser-close guard scoped to in-flight only.** `useBeforeUnloadGuard(controller.isInFlight)` registers `beforeunload` only while a batch has unfinished work. Cleanup runs the moment everything reaches a terminal status — the guard does not linger after the user has dismissed all failures.
- **Document-row-level retry is intentionally NOT implemented in `FileList`.** Spec 3.6.4 mentions "any failed row in the file list also exposes Retry and Dismiss inline." Failed-during-upload rows live in the upload session and surface in the banner / popover. Failed-after-upload rows (worker pipeline failure) appear in the file list with a `Failed` status badge and can be deleted via the existing per-row delete; we have no re-upload endpoint, so a "Retry" inline would be misleading. Decision documented; revisit if a re-upload-by-documentId endpoint lands.

## Review outcomes

### Code review (2 findings, both auto-fixed)
1. **High** — `folderEntryWalk.ts` used `for (let i = 0; …)` (single-letter loop counter forbidden by `web-coding-standards.md`). Fixed: extracted `MAX_BATCHES = 1000` const, renamed counter to `batchIndex`.
2. **Medium** — `uploadReducer` switch was exhaustive but had no `default: const _: never = action; return _;` — `web-coding-standards.md` requires reducers to have it for compile-time safety against newly-added action types. Fixed.

### Security review (PASS — 0 findings)
Walked OWASP A01–A10 and the advanced frontend list. Highlights:
- Tokens never persisted; the upload session and its `File` references live only in memory and are dropped at session-end.
- File names render as React text nodes — auto-escaped. No `dangerouslySetInnerHTML`, `eval`, `Function`, `innerHTML`, or `javascript:` URI construction in S3.
- Every fetch URL is built from `apiBaseUrl + const path` — no user input flows into URLs.
- `__stubControls` is only set inside `installStubFetch()`, which is only called when `?stub=1` is in the URL (standalone dev shell). Production builds expose `<IndexerApp />` to a consuming app that supplies its own host; `bootstrap.tsx` never executes in that path.
- `npm audit` reports the same 4 low-severity findings in `jest-environment-jsdom`'s transitive `http-proxy-agent`/`jsdom` chain that S1 and S2 already acknowledged. Test-only; no production exposure. **No new dependencies in S3.**

### Final gate state
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — **404 / 404 jest tests pass**, all coverage thresholds met (branches ≥ 80 %, functions/lines/statements ≥ 80 %)
- `npm run test:e2e -- --project=chromium` — **36 / 36 pass** (including the 7 new upload tests). The Playwright config also enumerates an `msedge` project; the local environment cannot install Edge without sudo, so it was not exercised in this run. CI pipelines that have Edge available will pick up the same e2e specs unchanged.

## Open follow-ups

- **App Insights instrumentation for upload failures.** The controller's `catch {}` blocks intentionally swallow errors and surface them via state — when the App Insights wiring lands (carried over from S1's open follow-up), each catch should `trackException` with the operationId. None of those catch blocks log file names or user content today, so the wiring is purely additive.
- **`data-model.md §2.1` prose drift.** The aggregate-status enum in the prose lists `Uploading | Completing` — the locked domain.ts type uses BatchStatus values. Sync the prose at the next architecture-review pass.
- **Document-move-between-folders (Conflict C11)** — still descoped; no API endpoint. The drag-target on document rows remains unrendered.
- **`?stub=1` production guard** — still pending from S2's open follow-ups. `installStubFetch()` should also gate on `process.env.NODE_ENV !== 'production'` if the standalone bundle is ever served publicly.
- **fake-indexeddb interaction with parallel jest workers** — S2 already pinned `npm test` and `npm run test:coverage` to `--runInBand`. The S3 test suite (404 tests) remains stable with serial execution; runtime ~30 s.
