# Slice 04 — Read-only mode polish, responsive layout, accessibility sweep

**Status:** completed
**Spec sections:** 2.1 (final pass), 4.6, 5.1, 5.3, 5.4, 5.5
**Date:** 2026-05-06

## Capability sentence

*As a read-only viewer, see no mutating controls anywhere in the indexer; use the indexer comfortably on tablet and mobile; navigate the whole indexer surface by keyboard.*

## Spec-section reference

Spec §2.1 (read-only viewer affordance suppression — final sweep across the indexer's surface), §4.6 (read-only mode wording), §5.1 (responsive — desktop / tablet / mobile breakpoints), §5.3 (persisted user preferences — none new in this slice; theme toggle stayed put), §5.4 (keyboard pass — Escape across panel and modals), §5.5 (accessibility — ARIA live regions, status pill text labels, truncated-name tooltips).

## Layers changed

| Layer | What changed |
|---|---|
| Migrations / DB / API | none — frontend-only project |
| Shared types | none — `accessRole` already on `IndexerEvent('collection/activated')` and `DocumentSetSummary`; consumed unchanged |
| `/shared/` utilities | none — no new entries to `shared-inventory.md` |
| `IndexerApp/RootShell.tsx` | added `<List>` hamburger button, `isMobileSidebarOpen` ephemeral state, `closeMobileSidebar` / `toggleMobileSidebar` callbacks, document-level Escape via `useKeyboardEscape`, sidebar-slot wrapper with `id="indexer-collections-sidebar"` so the hamburger can `aria-controls` it, mobile-only backdrop `<button aria-label="Dismiss collections menu">`, auto-dismiss of the overlay on `documentSetId` change, threaded `onAfterCollectionSelect={closeMobileSidebar}` to the sidebar |
| `IndexerApp/RootShell.module.css` | added `.hamburger` (hidden by default, `display: inline-flex` at mobile breakpoint), `.sidebarSlot` + `.sidebarSlotMobileOpen` (slide-in transform at mobile), `.mobileBackdrop` using the project-standard `color-mix(in srgb, var(--color-navy) 50%, transparent)` scrim, tablet (max-width: 960px) header padding tweak, mobile (max-width: 720px) breakpoint that turns the sidebar into a fixed slide-in overlay and stacks the folder pane above the content pane |
| `features/collections/CollectionsSidebar.tsx` | added optional `onAfterCollectionSelect?: () => void` prop, fired after every row click that resolves to a `select(...)` call (skipping the upload-guard / inline-rename no-ops); added `title={row.name}` on the row-name button so truncated names get a native tooltip |
| `features/folders/FolderTree.tsx` | added `title={node.name}` on the folder button for tooltips on truncated names |
| `features/fileList/FileList.tsx` | added `title={doc.fileName}` on the file-name span for tooltips on truncated names |
| `features/upload/UploadProgressBanner.tsx` | added `useKeyboardEscape(state.bannerExpanded, controller.toggleBanner)` so Escape collapses the expanded panel (spec 5.4); added `title={file.file.name}` on the file-name cell |
| `features/upload/FailedFilesPopover.tsx` | added `title={file.file.name}` on the file-name span |
| `features/collections/test-utils.tsx` | added optional `initialActiveId?: string` prop to `<Harness>` and a private `<InitialActiveIdSetter>` sub-component that calls `select(id, 'Owner')` once on mount — supports tests that need a pre-existing active collection without driving the UI |
| `host/stubFetch.ts` | extended `__stubControls` with `seedSharedCollection(name)` — seeds a `Shared`-role collection plus one folder + one document so the read-only e2e suite has something to render. Same dev-only risk profile already accepted in S2 / S3 |
| `IndexerApp/IndexerApp.test.tsx` | added 4 hamburger / mobile-sidebar tests (initial state, backdrop renders only when open, Escape closes, axe-clean with overlay open) |
| `features/collections/CollectionsSidebar.test.tsx` | extended `renderSidebar` signature to accept sidebar prop overrides + initial active id; added tooltip test, `onAfterCollectionSelect` fires-on-row-click test, and the negative case (upload-guard suppresses the callback) |
| `features/folders/FolderTree.test.tsx` | added one tooltip test |
| `features/fileList/FileList.test.tsx` | added one tooltip test |
| `features/upload/UploadProgressBanner.test.tsx` | added Escape-collapses-when-expanded test, Escape-no-op-when-collapsed test, and one tooltip test |
| `features/upload/FailedFilesPopover.test.tsx` | added one tooltip test |
| Tests (Playwright) | new `e2e/accessibility.spec.ts` (5 axe sweeps across landing / active collection / file-type filter open / share dialog open / upload-banner expanded), `e2e/responsive.spec.ts` (5 viewport tests — desktop / tablet / mobile / mobile + Escape / mobile + auto-dismiss-on-select), `e2e/read-only.spec.ts` (3 surface tests using the new `seedSharedCollection` helper plus an `addInitScript` setter trap so the seed runs before React mounts) |

## /shared/ additions

This slice ships **no new entries** in `shared-inventory.md`. Every helper used here was already real after S1–S3.

## Architecture-doc updates

- [`slice-plan.md`](./slice-plan.md) — S4 marked `Status: completed` with link to this doc.
- [`README.md`](./README.md) — row added for this doc.

No locked signatures (`IndexerAppProps`, `IndexerEvent`, `IndexerHandle`, `ThemeTokenKey`) moved.

## Decisions and trade-offs not visible from the diff

- **Media queries on `RootShell`, not container queries** for the desktop / tablet / mobile pivot. `web-styling.md` says "prefer container queries when the layout depends on the component's container width, not the viewport." The indexer's outer breakpoints depend on the **mounting host's viewport**, not the indexer's own container width. Inner panes don't have meaningfully different behaviour at different pane widths in v1, so no container queries were needed inside features either. User confirmed this interpretation before any code was written.
- **Hide-not-disable as the universal pattern for read-only mutating affordances.** Every mutating affordance across S1–S3 (Share / Rename / Delete on the sidebar row, New folder / Rename / Delete in the folder tree, Add files / Add folder in the upload toolbar, per-row + bulk delete in the file list, Delete in the document properties panel) was already gated by `{!isReadOnly && (…)}` from prior slices. The S4 sweep confirmed the policy held at every call site; no `disabled={isReadOnly}` patterns required conversion.
- **Mobile sidebar = navigation overlay, not a modal dialog.** The mobile sidebar gets a slide-in overlay with backdrop, hamburger toggle, Escape-to-close, and auto-dismiss on collection-select. It does **not** trap focus. `web-accessibility.md`'s focus-trap rule applies to modals; a navigation menu is a different pattern (Tab through the list, Escape to close). The two are distinguished in the source so a future maintainer doesn't graft modal semantics on.
- **Distinct aria-labels for the hamburger and the backdrop.** Both controls dismiss the sidebar, but they're separate affordances. The hamburger flips between "Open collections menu" / "Close collections menu" (drives `aria-expanded` on the same element); the backdrop is `aria-label="Dismiss collections menu"` so assistive tech surfaces two queryable controls instead of two ambiguous "Close" buttons. Discovered while debugging a `getByRole` collision in the jest tests.
- **Auto-dismiss on row click via callback, not via `documentSetId`-change effect.** The natural-feeling implementation watches `documentSetId` in a `useEffect` and clears the overlay. That breaks for users with only one collection: re-clicking the active row doesn't change the id, so the effect doesn't fire. Added an explicit `onAfterCollectionSelect` callback prop to `CollectionsSidebar` and wired `closeMobileSidebar` from `RootShell` — the overlay dismisses on every row click that resolves to a select, regardless of whether the id actually changed. The callback is suppressed when the upload-guard toast fires (so the overlay stays open and the user sees the toast).
- **`InitialActiveIdSetter` test-utils helper** is a private sub-component inside `test-utils.tsx`. It runs a one-shot `useEffect` to call `select(id, 'Owner')`. Stable `select` reference (memoized in `state.tsx`), exhaustive deps `[id, select]`, no infinite-loop risk. Lets new tests express "pre-existing active collection" without driving the UI to set it.
- **`seedSharedCollection` in `stubFetch.ts`** adds a single helper to the dev-only `__stubControls` surface so the read-only e2e can render against a `Shared` collection. Same Low-risk acknowledgement as the existing `seedDocumentSet` / `failNext` controls — only set when `?stub=1` is in the URL; production builds are loaded via the consuming app and never run `bootstrap.tsx`.
- **Read-only e2e seeding via Playwright `addInitScript` setter trap.** Calling `seedSharedCollection` after `page.goto(...)` resolves leaves the state seeded but the React Query list query has already fetched empty, and `page.reload()` resets the in-memory stub state to seed-empty. Solved by `page.addInitScript(() => Object.defineProperty(window, '__stubControls', { set(value) { … seedSharedCollection(name) … } }))` so the seed runs the moment `installStubFetch()` assigns its controls object — before React mounts and before the list query fires.
- **`mobileSidebarOpen` → `isMobileSidebarOpen` rename** during `/code-review`. `web-coding-standards.md` requires the `is`/`has`/`should`/`can` prefix on boolean variables; existing codebase had a mix (`isInFlight`, `isOwner`, `isReadOnly` vs `bannerExpanded`, `collapsed`). Aligned with the rule. The setter (`setMobileSidebarOpen`) was left as-is — setter names don't carry the prefix.
- **`color-mix(in srgb, var(--color-navy) N%, transparent)` for backdrop scrim and slide-in shadow** instead of raw `rgba(0, 0, 0, 0.4)` / `rgba(0, 0, 0, 0.25)`. Matches the project's existing pattern in `Modal.module.css` and `Toast.module.css`. Surfaced by `/code-review` against `web-branding.md`.

## Review outcomes

### Code review (2 Medium findings, both auto-fixed)
1. **Medium** — `mobileSidebarOpen` boolean state in `RootShell.tsx` lacked the `is`/`has`/`should`/`can` prefix required by `web-coding-standards.md`. Renamed to `isMobileSidebarOpen` across all references (state declaration, callbacks, JSX, aria props). Setter name `setMobileSidebarOpen` left as-is per setter idiom.
2. **Medium** — `RootShell.module.css` used raw `rgba(0, 0, 0, 0.4)` for the mobile backdrop and `rgba(0, 0, 0, 0.25)` for the slide-in shadow, inconsistent with the project's `color-mix(in srgb, var(--color-navy) N%, transparent)` pattern in `Modal.module.css` / `Toast.module.css`. Replaced with the `color-mix` form.

Gates re-run after fixes: lint clean, tsc clean, **417/417 jest pass**, S4 e2e re-pass.

### Security review (PASS — 0 findings)
Walked OWASP A01–A10 and the advanced frontend list. Highlights:
- All new `title={…}` attributes pass through React's automatic escaping; source values are pre-existing strings already rendered as text nodes.
- No `dangerouslySetInnerHTML`, `eval`, `Function`, `innerHTML`, or `javascript:` URI construction in S4.
- No new fetch URLs, no new redirects, no new direct-object-reference paths.
- No new dependencies. `npm audit` set unchanged from S3.
- `seedSharedCollection` extends the dev-only `__stubControls` surface already accepted at Low risk in S2 / S3 (only set when `?stub=1`). Production builds are loaded by a consuming app and never run `bootstrap.tsx`.
- `test-utils.tsx` is imported only by `*.test.*` files (verified via grep); tree-shaken from production bundles.
- The Playwright `Object.defineProperty(window, '__stubControls', …)` setter trap runs in the test browser only, never in production.

### Final gate state
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — **417 / 417 jest tests pass**, all coverage thresholds met (branches / functions / lines / statements ≥ 80 %)
- `npm run test:e2e -- --project=chromium` — **49 / 49 pass** (including the 13 new specs: 5 accessibility, 5 responsive, 3 read-only). The Playwright config also enumerates an `msedge` project; the local environment cannot install Edge without sudo, so it was not exercised in this run — same caveat S3 already documented. CI pipelines that have Edge available will pick up the same e2e specs unchanged.

## Open follow-ups

- **App Insights instrumentation** — still pending from S1's open follow-up. The new `useKeyboardEscape` integration and the hamburger toggle are non-logging additions; they wire cleanly when telemetry lands.
- **`?stub=1` production guard** — still pending from S2 / S3. `installStubFetch()` should also gate on `process.env.NODE_ENV !== 'production'` if the standalone bundle is ever served publicly. S4 does not regress or extend this surface.
- **`data-model.md §2.1` prose drift** — still pending from S3. Aggregate-status enum prose vs. locked TypeScript type. S4 doesn't touch the file.
- **Document-move-between-folders (Conflict C11)** — still descoped. No API endpoint; the drag-target on document rows remains unrendered.
- **fake-indexeddb interaction with parallel jest workers** — `npm test` and `npm run test:coverage` remain pinned to `--runInBand` per S2 / S3. The S4 test suite (417 tests, +13 from S3) remains stable with serial execution; runtime ~24 s.
- **API-handoff document divergence** — flagged at the start of S4: `/Users/chris/Downloads/frontend-integration.md` and the live swagger at `https://globalapi-test-dcfad7eka5b0gkhk.z01.azurefd.net/swagger/index.html` describe endpoint shapes that differ from `docs/architecture/api-contracts.md` (browse contents method, batch-status method, atomic `/folders/ensure`, image-type allowlist). The user confirmed the locked `api-contracts.md` and `frontend-api-contract.md` remain authoritative; the handoff doc and swagger are out-of-date. No code changes made for that divergence. If the wire contract is later updated to match the handoff, that work is a separate rebaseline task per `slicing.md`'s drift-cap rule, not an S4 follow-up.
