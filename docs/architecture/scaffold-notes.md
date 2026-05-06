# Scaffold Notes — Step 2

Decisions and clarifications surfaced while standing up the empty skeleton. Recorded here so they survive into the slice phase. Nothing in this file changes a locked architecture signature — material divergence would have triggered a Step 1 re-review.

---

## What was scaffolded

- All directories declared in `module-boundaries.md` §3 are present under `web/src/`.
- All shared-inventory entries (`utils/`, `hooks/`, `components/`, plus `host/`, `api/`, `theme/`) are stubbed at their declared locations with one-line "what belongs here" comments.
- `IndexerApp/index.tsx` is the only **real** runtime composition: forwardRef + `useImperativeHandle` exposing the documented `IndexerHandle` (method bodies stubbed); wraps `<RootShell />` in `<Providers />` (HostProvider + ThemeProvider + ErrorBoundary). It renders a placeholder banner that echoes `apiBaseUrl` so a smoke test can prove the host contract.
- The scaffold smoke test (`web/src/IndexerApp/IndexerApp.test.tsx`) is the indexer's equivalent of a `/health` endpoint — it asserts the host contract reaches the tree, the imperative handle is callable, no spurious `IndexerEvent` fires on mount, and axe finds no a11y violations on the default render.
- Path alias `@shared/*` resolves to `/shared/*` in TypeScript (`tsconfig.app.json`, `tsconfig.test.json`), Jest (`moduleNameMapper`), and Webpack (`resolve.alias`).
- ESLint's `no-unused-vars` rule was relaxed to honor the `_`-prefixed-unused convention (`argsIgnorePattern: '^_'` etc.) so signature-only stubs satisfy lint.
- The pre-existing `<head>` theme initialisation script in `web/index.html` was kept — `theme/prePaintScript.ts` is the canonical string the federated build will inject into a host shell.

## Health-check exit criterion

A frontend SPA does not host an HTTP `/health` endpoint, so the equivalent green-light evidence is:

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, zero errors |
| `npm run lint` | clean |
| `npm test -- --no-coverage` (smoke suite) | 5/5 passing including a `jest-axe` zero-violation assertion |
| `npm run build` (production) | webpack compiled successfully; vendor chunk split; CSS extracted |
| `npm run dev` + `curl http://localhost:8080/` | HTTP 200, `<title>Reusable Indexer</title>`, main bundle 200 OK |

Coverage gate is intentionally not run at scaffold time — the project's 80% floor only becomes meaningful once feature code lands. Slices reinstate it.

## Decisions made during scaffold

1. **`@module-federation/enhanced` is deferred to S1**, not installed at scaffold time. The architecture (`module-boundaries.md` §1) declares MF as the deployment shape, but the runtime API is feature-adjacent (singleton scope, exposed `./IndexerApp`, async-boundary `bootstrap.tsx`) and changing the webpack config to expose modules has no value without consumer code that loads them. The scaffold runs as a regular SPA via `webpack-dev-server`; S1 wires MF, adds `bootstrap.tsx`, and updates the production build to publish a remote entry. **No architectural impact** — the host contract (`/shared/types/host-contract.ts`) is already locked and `<IndexerApp />` is already a `forwardRef` component, so flipping MF on is purely a build-config change.

2. **TanStack Query is deferred to S1** for the same reason — its provider is needed only when an `api/endpoints/*` hook actually issues a query, and the scaffold ships none.

3. **`@phosphor-icons/react` is deferred to S1.** The component primitives that depend on it (`IconButton`) are stubs; the dependency lands the moment a real implementation needs it.

4. **`eslint-plugin-import` `no-restricted-paths` / `no-cycle` rules are deferred to S1.** Module-boundaries.md §4 declares these as the boundary-enforcement mechanism; turning them on now provides no value (the directory tree is empty stubs and no cross-feature imports exist). S1 turns them on as the first action and fails CI on any violation introduced by feature work.

5. **The pre-existing `appInsights.ts` module was removed.** The scaffold pattern is: the host supplies `appInsights` via the host contract; if absent, the indexer logs nothing. The earlier "initialize at module load" pattern conflicted with the host-contract guarantee that the indexer never calls `loadAppInsights()` on a host-supplied instance. `Providers.tsx` now routes `error/unhandled` events through `host.onEvent` and `host.appInsights?.trackException`.

6. **`web/src/styles/global.css` was reduced to resets only.** Theme tokens are applied by `<ThemeProvider />` to a scoped wrapper, so the indexer never bleeds tokens onto a host page's `:root`. The pre-paint script still flips `data-theme` on `<html>` (used by both branding-rule selectors and the wrapper).

7. **`web/src/IndexerApp/RootShell.module.css` is the only feature-adjacent stylesheet shipped at scaffold.** It styles the placeholder banner. Real feature CSS lands per slice.

## Gaps / unresolved

None block scaffold sign-off. The four Open Conflict-Log entries (C5, C6, C8, C11 in `data-model.md` §5) remain awaiting API-side input but do not affect Step 2.

## Files added under `/shared/`

`/shared/types/` was populated in Step 1 (`api.ts`, `domain.ts`, `host-contract.ts`, `index.ts`) and is unchanged at Step 2 — every layer that needs a contract type imports from `@shared/types`.

The shared-inventory primitives (utils, hooks, components) live inside `web/src/` per the architecture (Tier 1–3 of `dependency-graph.md`); each category folder has a charter `README.md` (`web/src/utils/README.md`, `web/src/hooks/README.md`, `web/src/components/README.md`, `web/src/host/README.md`, `web/src/api/README.md`, `web/src/theme/README.md`, `web/src/features/README.md`). A future move to a true `/shared/<concern>/` package layout would only happen if the indexer split into multiple buildable packages — out of scope today.

## Confirmation to the reviewer

- **(a)** The directory structure supports the slice plan. Every slice (S1–S4 in `slice-plan.md`) has a target directory ready to receive its work; no slice needs to invent a new top-level location.
- **(b)** `/shared/types/` is sufficient for slices S1–S3 to consume rather than reimplement. The wire DTOs, domain narrowings, and host contract are all in place; new types added during slices will extend, not replace, what's there. The shared-inventory primitives (utils, hooks, components) are signature-stubbed at the declared locations so a slice author can import them and get a "not implemented (slice SN)" error rather than an `import path not found` error — making the next slice's first action obvious.
