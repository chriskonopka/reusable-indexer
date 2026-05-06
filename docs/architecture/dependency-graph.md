# Dependency Graph — Reusable Indexer (Frontend)

Module-to-module imports. Must be **acyclic** — verified at lint time by `eslint-plugin-import`'s `no-cycle` rule (configured in S1).

If a future change would introduce a cycle, the answer is to hoist shared code into a higher tier (`utils`, `hooks`, `components`, or `shared/types`), not to relax the rule.

---

## 1. Tiers

Modules are organized in tiers. **Imports flow downward only**: a module in tier N may import from tier N-1 and below; never from tier N+1.

```
tier 5  features/*  ─────────────────────────────────┐
                                                     │
tier 4  IndexerApp/                                  │ never imports up
                                                     │
tier 3  components/   hooks/                         │
                                                     │
tier 2  api/         theme/        host/             │
                                                     │
tier 1  utils/                                       │
                                                     │
tier 0  /shared/types/  (no runtime; type-only) ─────┘
```

- A feature in tier 5 may import from tiers 0–3.
- `IndexerApp/` in tier 4 composes everything; features sit *under* it in render but *below* it in imports — `IndexerApp` may import features, features must not import `IndexerApp`.
- Tier 1 `utils/` is pure functions only — no React, no side effects (per `web-file-structure.md`).
- Tier 0 `/shared/types/` has zero runtime dependencies — type-only.

---

## 2. Module-by-module dependencies

### Tier 0 — `/shared/types/`

```
api.ts        →  (no runtime deps)
domain.ts     →  api.ts
host-contract →  api.ts (AccessRole), @microsoft/applicationinsights-web (type-only)
index.ts      →  api.ts, domain.ts, host-contract.ts
```

### Tier 1 — `web/src/utils/`

```
utils/dateLabels.ts        →  (none)
utils/fileTypeFilter.ts    →  shared/types
utils/folderPath.ts        →  shared/types
utils/junkFileFilter.ts    →  (none)
utils/idb.ts               →  (none)
utils/normalizeError.ts    →  shared/types
```

### Tier 2 — `web/src/api/`, `web/src/theme/`, `web/src/host/`

```
api/client.ts              →  utils/normalizeError, host/useHost (read-only)
api/queryKeys.ts           →  shared/types
api/endpoints/*.ts         →  api/client, api/queryKeys, shared/types

theme/tokens.ts            →  (none)
theme/ThemeProvider.tsx    →  theme/tokens
theme/prePaintScript.ts    →  (none — string template)

host/HostContext.tsx       →  shared/types/host-contract
host/useHost.ts            →  host/HostContext
host/stubHost.ts           →  shared/types/host-contract
host/types.ts              →  shared/types/host-contract  (re-export only)
```

> Note: `api/client.ts` reads `useHost` for `getAccessToken` and `apiBaseUrl` — but only via a hook called from React components. The fetch wrapper itself is a function that takes a config object; a thin React hook (`useApiClient()`) wires the host values into it. This avoids a static import cycle between `api` and `host`.

### Tier 3 — `web/src/components/`, `web/src/hooks/`

```
components/Button/         →  theme/tokens (CSS vars only, not a code import), utils/*
components/Modal/          →  hooks/useFocusTrap
components/Toast/          →  hooks/useToast
components/Pill/           →  shared/types
components/IconButton/     →  @phosphor-icons/react
components/EmptyState/     →  (none beyond types)
components/ErrorBoundary/  →  host/useHost (to surface error/unhandled events)

hooks/usePersistedReducer.ts  →  utils/idb
hooks/useFocusTrap.ts         →  (none)
hooks/useDebouncedValue.ts    →  (none)
hooks/useApiClient.ts         →  api/client, host/useHost
hooks/useToast.ts             →  (Context + reducer; no other deps)
hooks/useKeyboardEscape.ts    →  (none)
hooks/usePolling.ts           →  (none)
```

### Tier 4 — `web/src/IndexerApp/`

```
IndexerApp/index.tsx       →  Providers, RootShell  (forwardRef + useImperativeHandle to expose IndexerHandle)
IndexerApp/Providers.tsx   →  theme/, host/, api/, components/ErrorBoundary, hooks/useToast
IndexerApp/RootShell.tsx   →  features/collections, features/folders, features/fileList,
                              features/upload, hooks/usePersistedReducer
```

### Tier 5 — `web/src/features/*`

Each feature imports from tiers 0-3 only. No feature imports from another feature.

```
features/collections/    →  api/endpoints/collections, components/*, hooks/*, shared/types
features/folders/        →  api/endpoints/folders, components/*, hooks/*, shared/types
features/fileList/       →  api/endpoints/folders, api/endpoints/documents,
                            components/*, hooks/*, shared/types
features/upload/         →  api/endpoints/documents, api/endpoints/folders,
                            components/*, hooks/usePolling, hooks/usePersistedReducer,
                            utils/junkFileFilter, utils/fileTypeFilter, utils/folderPath,
                            shared/types
```

Cross-feature **data flow** happens through props and callbacks passed by `RootShell`, never through cross-feature imports:
- `collections` → reports active `documentSetId` and `accessRole` to `RootShell`. `RootShell` re-emits as `IndexerEvent('collection/activated')` and as `'collection/list-changed'` after CRUD mutations.
- `RootShell` passes `documentSetId` and `accessRole` to `folders`, `fileList`, `upload`.
- `fileList` → emits "row click on ready document" up to `RootShell`. `RootShell` re-emits as `IndexerEvent('document/selected')`.
- `upload` → notifies `RootShell` of the active batch so `RootShell` can guard collection switches (spec 3.2.5).

---

## 3. Third-party dependencies

| Package | Tier introduced | Notes |
|---|---|---|
| `react`, `react-dom` | tier 4 (already in package.json) | MF singleton. |
| `@microsoft/applicationinsights-web` | tier 2 (already present) | Used by host contract type-only and by indexer's bootstrap when host omits it. |
| `@tanstack/react-query` | tier 2 — new in S1 | Server-state cache. |
| `@phosphor-icons/react` | tier 3 — new in S1 | Required by `web-branding.md`. Outline weight only. |
| `@module-federation/enhanced` | build-only — new in S1 | Webpack plugin. Not in runtime imports. |

Each addition gets a `web-dependency-security.md` audit before installation. No critical/high CVEs accepted.

The indexer ships **no** PDF library, **no** SSE parser, **no** chat / streaming dependencies — those are the consuming application's concern.

---

## 4. Acyclicity proof

Walking from any tier-5 feature, every import path terminates at tier 0 (`/shared/types/`) or in third-party packages. No path ever ascends.

The four guard clauses prevent cycles:

1. **Features cannot import from features.** A feature needing another feature's behavior is wrong — hoist the shared code.
2. **`IndexerApp/` cannot be imported by anything else.** It is the composition root.
3. **`api/` cannot import from `features/`.** Features are consumers of the API client, not the other way round.
4. **`utils/` cannot import from `hooks/` or `components/`.** Pure functions only.

These four clauses are enforced by `eslint-plugin-import` (`no-restricted-paths` and `no-cycle`) configured at the start of S1. Lint failure blocks merge per `web-linting-formatting.md`.
