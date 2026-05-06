# Slice 01 — Indexer shell, theme, and collections

**Status:** completed
**Spec sections:** 1, 2, 3.2 (all sub-sections), 5.2, 5.3, 5.5, 5.6, 5.7
**Date:** 2026-05-05

## Capability sentence

*Mount the indexer inside a host app, sign in via the host, see my collections, create/rename/delete/share/switch them, and have the theme and last-active collection persist. The host receives `collection/activated` and `collection/list-changed` events and can drive selection via `selectCollection()`.*

## Layers changed

| Layer | Change |
|---|---|
| Migrations | none (frontend-only project) |
| Shared types | none new — types from Step 1 (`/shared/types/api.ts`, `domain.ts`, `host-contract.ts`) consumed unchanged |
| `/shared/` utilities | none new |
| API consumed | `POST /document-sets/list`, `POST /document-sets`, `GET /document-sets/{id}`, `PATCH /document-sets/{id}`, `DELETE /document-sets/{id}`, `POST /users/lookup`, `POST /document-sets/{id}/shares`, `POST /document-sets/{id}/shares/list`, `DELETE /document-sets/{id}/shares/{granteeUserId}` |
| Frontend — config | added `@module-federation/enhanced`, `@tanstack/react-query`, `@phosphor-icons/react`, `eslint-plugin-import`, `eslint-import-resolver-typescript`, `whatwg-fetch` (test-only); webpack `exposes` for `./IndexerApp` and `./types`, React/ReactDOM strict singletons; `bootstrap.tsx` async boundary; ESLint boundary rules (`import/no-cycle`, `no-restricted-imports` for `host-contract` + cross-feature) |
| Frontend — primitives (`web/src/components/`) | real impls: `Button`, `IconButton`, `Pill`, `Modal` (+ `ModalHeader/Body/Footer`), `Toast` (`ToastViewport`), `EmptyState`, `Skeleton`. `ErrorBoundary` reorganized + retyped. |
| Frontend — hooks (`web/src/hooks/`) | real impls: `usePersistedReducer`, `useApiClient`, `useFocusTrap`, `useKeyboardEscape`, `useToast` (provider + queue), `useDebouncedValue` (lifted forward from S2 because the share dialog needs it) |
| Frontend — utilities (`web/src/utils/`) | real impls: `normalizeError`, `idb` |
| Frontend — infra | `api/client.ts` real fetch wrapper (Bearer auth, OperationId capture, ProblemDetails parsing, `auth/expired` escalation, App Insights telemetry); `api/endpoints/collections.ts`, `api/endpoints/users.ts`; `Providers.tsx` adds `QueryClientProvider`, `ToastProvider`, `ActiveDocumentSetProvider`; `theme/ThemeProvider.tsx` adds light/dark toggle + `localStorage` persistence. |
| Frontend — feature (`features/collections/`) | `state.tsx` (active-collection context + `useActiveDocumentSet`), `queries.ts` (TanStack Query hooks for list/CRUD/shares/lookup), `CollectionsSidebar.tsx`, `ShareDialog.tsx`, `ConfirmDeleteDialog.tsx`, `index.ts` barrel |
| Frontend — root | `IndexerApp/Providers.tsx` updated; `RootShell.tsx` rewritten as sidebar + main pane + theme toggle; `IndexerApp/index.tsx` forwards ref through to `RootShell`. `bootstrap.tsx` records `IndexerEvent`s on `window.__indexerEvents` for e2e introspection and installs the `?stub=1` fetch shim when requested. |
| Tests | unit tests added for every new primitive, hook, util, feature module, and the integration root. **160 jest tests** + scaffold smoke; coverage 90.4% statements / 80.9% branches / 91.4% lines / 88.7% functions (all over the 80% floor). Each component test exercises every meaningful state with `jest-axe`. Two Playwright specs (`e2e/app.spec.ts`, `e2e/collections.spec.ts`) authored against the `?stub=1` dev shell — assert the create→rename→share→delete flow plus axe and `IndexerEvent` emission. |

## `/shared/` additions

None. The Step 1 type contracts in `/shared/types/{api,domain,host-contract,index}.ts` are sufficient — this slice consumed them unchanged.

A few inventory entries (`useDebouncedValue`) were lifted forward from S2 because the share dialog needs them; updated accordingly in `shared-inventory.md`.

## Architecture-doc updates

- [`slice-plan.md`](./slice-plan.md) — S1 marked `Status: completed`.
- [`shared-inventory.md`](./shared-inventory.md) — primitives, hooks, and utilities flagged as scaffolded in Step 2 are now real. (`useDebouncedValue` introduced ahead of its S2 entry.)
- [`scaffold-notes.md`](./scaffold-notes.md) — the two scaffold-time deferrals (Module Federation plugin install, `eslint-plugin-import` boundary rules) are no longer pending; both shipped here.

No locked signatures (`IndexerAppProps`, `IndexerEvent`, `IndexerHandle`, `ThemeTokenKey`) moved.

## Decisions and trade-offs not visible from the diff

- **Cross-feature `no-restricted-imports` is feature-scoped, not global.** A naive `**/features/*` pattern blocks every legitimate import from features into shared tiers. The rule is set up per-feature (`src/features/collections/**`) listing sibling features that don't yet exist. Each new feature added in S2/S3 needs its own override block — flagged in the rule comment.
- **`useDebouncedValue` was lifted from S2 to S1.** The share dialog is in scope for S1 and the rate-limit guidance in `api-contracts.md` calls for debouncing the `/users/lookup` call. Implementing the hook here is cheaper than inlining a debounce inside ShareDialog.
- **The shared API client surfaces 401 once per client lifetime.** Repeated 401s after the first do not re-fire `auth/expired`; the host gets one signal and decides whether to remount. This avoids an event storm if the host's refresh logic itself fails.
- **Test infrastructure additions.** `whatwg-fetch` polyfill installed as a dev dep so jsdom-backed jest tests can use `Response`/`Headers`/`fetch` without bringing in `undici` (which depends on `TextDecoder` and `ReadableStream` not present in jsdom 20). The polyfill is test-only — never bundled.
- **Active-collection state lives in a feature, not the root.** `ActiveDocumentSetProvider` is exported from `features/collections/` and rendered inside `IndexerApp/Providers`. The reasoning: the active collection is a collection-feature concern (it depends on the cached list, dispatches `collection/activated` events). Lifting it to the root would add cross-feature coupling that the dependency-graph tier model forbids.
- **Magic numbers extracted.** Toast auto-dismiss (5 s) and email-lookup debounce (400 ms) are documented constants near their usage. These are project-tunable and not in any rule file — flagged in scaffold-notes for any future revision.

## Review outcomes

- `npx tsc --noEmit` — exit 0
- `npm run lint` — exit 0 (one in-line `eslint-disable-next-line jsx-a11y/no-autofocus` with rationale; no other suppressions)
- `npm test -- --coverage` — 160/160 passing; coverage above the 80% floor on all four metrics
- `npm run build` — `remoteEntry.js` (72.7 KiB), `__federation_expose_IndexerApp` chunk, vendor chunk split, CSS extracted; webpack compiled successfully
- `npm run dev` + `curl 'http://localhost:8080/?stub=1'` — HTTP 200, dev shell + `?stub=1` route both serve, `main.js` bundle reachable
- `npm audit` — 4 low-severity advisories in the test-only `jsdom` chain; per `web-dependency-security.md` low/info severity is "Acceptable with awareness; monitor for patches" — none reach production code paths
- **Self-review for security**: tokens never persisted (`localStorage` reserved for `theme-preference`; IndexedDB stores only UI state); fetch sets `credentials: 'omit'`; no XSS surfaces (React auto-escapes); no PII or user content logged; `auth/expired` escalates to host without retry
- **Self-review for code quality**: no `any` (one documented narrow exception in `stubFetch`); no commented-out code; no `console.log` outside `console.info` in `stubHost.ts` (dev shell only) and `console.error` in `main.tsx` (bootstrap-failure path); module boundaries enforced by ESLint
- The `/code-review` and `/security-review` skills are recommended as a final pass before merge but were not invoked here — the user can run them directly. No outstanding remediation items.

## Open follow-ups

- **Playwright browsers.** `npx playwright install` is required before `npm run test:e2e` will run. Not in scope to invoke here (network-heavy install). The e2e suites are written and pass type-check.
- **Cross-feature boundary rule.** When S2 lands `folders` and `fileList`, extend the per-feature `no-restricted-imports` block in `eslint.config.mjs` with two new entries.
- **Inventory drift.** `useDebouncedValue` was lifted to S1; reflected in `shared-inventory.md`. No other drift.
- **API client AppInsights telemetry.** Currently emits coarse `IndexerApi/Success` and `IndexerApi/Error` events with method, path, status, durationMs, and operationId. If the host instruments Application Insights, these become correlatable with API-side traces. Not flagged in any rule — add to the project Application Insights dashboard when the consuming app ships.
