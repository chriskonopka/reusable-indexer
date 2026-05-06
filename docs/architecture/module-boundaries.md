# Module Boundaries — Reusable Indexer (Frontend)

**Scope:** the reusable indexer SPA — a React component shipped as a Webpack 5 Module Federation **remote** that consuming applications mount at runtime. The indexer ships **ingestion + collection management only** — upload, collections, folders, file list, processing visibility, failure triage. Chat, citations, and document viewers are **the consuming application's** responsibility; the indexer supports them through the host contract surface defined in §2 below.

The consuming app itself is **not in scope** for this template.

This document locks:
1. The Module Federation surface (what the host loads, what it gets).
2. The host contract — props, events, and the imperative ref API the consuming app uses to compose chat / viewer / citations on top.
3. The internal module structure inside the indexer.

Locked signatures here are the inputs to Step 3 (`/build-application`). Changing one requires updating this doc and re-reviewing.

---

## 1. The Module Federation surface

### 1.1 Role

- The indexer is a **remote** in MF terms — it exposes modules consumed at runtime by a host application.
- The same bundle also runs **standalone** (`npm run dev`) for local development, against a dev-mode mock host that supplies a stub auth token and config. This is **not** a published consuming app — it is the indexer's own dev shell.

### 1.2 Plugin choice

- **Webpack 5 + `@module-federation/enhanced`** (the maintained successor to the built-in `ModuleFederationPlugin`). Justification:
  - Project is already on Webpack 5 (see `webpack.config.js`).
  - `@module-federation/enhanced` provides runtime API, async-boundary handling, and TypeScript type-sharing out of the box.
  - The requirements doc allows "Webpack 5 / Vite plugin" — Webpack matches the existing toolchain. Vite is **not** introduced.
- Singletons in the shared scope: `react`, `react-dom`, `react-dom/client`. Strict version match.

### 1.3 Exposed modules

Exactly two exposed paths. No more. Adding a third requires re-reviewing this doc.

| Exposed path | Default export | Purpose |
|---|---|---|
| `./IndexerApp` | `React.ForwardRefExoticComponent<IndexerAppProps & RefAttributes<IndexerHandle>>` | The full ingestion experience — sidebar, folder tree, file list, upload, status, failure triage. The host renders this once, takes a `ref` if it wants to drive selection imperatively, and walks away. |
| `./types` | TypeScript type re-export only (no runtime) | Lets the host type the props, events, and imperative handle without depending on a separate `@types` package. Compiles to a near-empty module at runtime. |

The host **does not** receive individual UI primitives, hooks, or stores. The boundary is `<IndexerApp />` and the props/ref it accepts.

### 1.4 What the indexer never exposes

- No mutation of `window` or other globals.
- No subscriptions to host-owned event buses.
- No direct DOM access outside the React tree it owns.
- No `localStorage` keys outside the `mws-indexer:` namespace (only `theme-preference`, also namespaced).
- No `IndexedDB` databases outside the `mws-indexer` database name.

---

## 2. The host contract

The full type lives in `/shared/types/host-contract.ts`. The contract has three parts: **inbound props** (what the host passes in), **outbound events** (what the indexer emits to the host), and the **imperative ref API** (what the host can call on the indexer).

### 2.1 Inbound — `IndexerAppProps`

```ts
interface IndexerAppProps {
  apiBaseUrl: string;                                       // required
  getAccessToken: () => Promise<string>;                    // required
  appInsights?: ApplicationInsights;
  themeOverrides?: Partial<Record<ThemeTokenKey, string>>;
  initialTheme?: 'light' | 'dark';
  initialState?: { documentSetId?: string; folderId?: string; documentId?: string };
  onEvent?: (event: IndexerEvent) => void;
}
```

- **`apiBaseUrl`** — base URL of the GlobalIndexer API. No trailing slash.
- **`getAccessToken`** — called once per outbound HTTP request. Host owns refresh, MSAL state, login UI. Returning empty / throwing → indexer raises `auth/expired` and stops.
- **`appInsights`** — optional shared instance. If supplied, the indexer logs through it without calling `loadAppInsights()`.
- **`themeOverrides`** — optional per-token CSS-variable overrides that merge over the built-in MWS tokens.
- **`initialState`** — optional deep-link.
- **`onEvent`** — receives every `IndexerEvent`.

### 2.2 Outbound — `IndexerEvent`

```ts
type IndexerEvent =
  | { type: 'auth/expired' }
  | { type: 'collection/activated';   documentSetId: string | null; accessRole: AccessRole | null }
  | { type: 'collection/list-changed' }
  | { type: 'document/selected';      documentSetId: string; documentId: string; folderId: string | null }
  | { type: 'error/unhandled';        operationId: string | null; messageForLogs: string };
```

How the consuming app uses each event:

| Event | Typical consuming-app reaction |
|---|---|
| `auth/expired` | Trigger silent token refresh; if it fails, surface login UI. Then remount the indexer. |
| `collection/activated` | Scope its chat panel to this `documentSetId`. Set `null` clears the panel. The `accessRole` lets the consuming app decide whether to show "send" or hide the input on read-only contexts. |
| `collection/list-changed` | Re-fetch its own collection-aware UI if any (e.g., a "switch collection from chat" affordance). Payload-free; debounce in the host as desired. |
| `document/selected` | Open its document viewer at this `documentId`. The indexer has done nothing else — no viewer, no preview pane. The consuming app decides what "selected" means. |
| `error/unhandled` | Log to host telemetry. The indexer itself stays mounted with its own fallback. |

### 2.3 Imperative ref API — `IndexerHandle`

```ts
interface IndexerHandle {
  selectCollection: (documentSetId: string | null) => void;
  revealDocument:   (documentId: string) => void;
}
```

Used when the consuming app needs to drive the indexer:

- **Host-owned URL routing.** If the host's URL is `/c/{documentSetId}`, the consuming app calls `selectCollection(id)` after each route change. The indexer mirrors via `collection/activated`.
- **Citation click.** When the user clicks a citation in the consuming app's chat, the consuming app opens its viewer **and** calls `revealDocument(documentId)` so the indexer's file list scrolls to and highlights the cited document.

Each method is **best-effort**: a no-op if the requested target is not in the user's accessible set. No error, no event. The consuming app should treat failure as silent.

### 2.4 Contract guarantees the indexer makes

- **Idempotent mount.** The host can unmount and remount `<IndexerApp />` without leaks — every subscription, interval, AbortController, and ResizeObserver registers in a `useEffect` cleanup.
- **No host-DOM mutation.** All rendering is inside the indexer's own subtree.
- **Encapsulated routing.** The indexer manages internal navigation in component state — it does not push to the host's history. Cross-boundary navigation surfaces via `IndexerEvent`. The host decides whether to mirror to its own router.
- **Single token call per request.** The HTTP client calls `getAccessToken()` exactly once per outbound request — never for retries that the standard resilience handler manages.
- **No credentials persisted.** Tokens are held only for the duration of a single `fetch` call, then dropped. They do **not** enter IndexedDB or `localStorage`.
- **No document content fetching.** The indexer never calls `GET /documents/{id}/content`. The consuming app's viewer fetches the binary itself.

### 2.5 Contract guarantees the host makes

- `getAccessToken()` resolves to a current, non-expired token. The indexer does not retry on `401` — instead it raises `auth/expired` and stops.
- `apiBaseUrl` reaches the GlobalIndexer API directly (or via Front Door). The indexer adds the path; the host adds nothing.
- If `appInsights` is supplied, it is already initialized. The indexer does **not** call `loadAppInsights()` on a host-supplied instance.
- The consuming app uses the **same** `getAccessToken` strategy when it calls the API directly (for chat / conversations / document content) so a single Entra ID session covers both sides.

---

## 3. Internal module structure (inside the indexer)

Follows `web-file-structure.md` — feature folders, colocated tests, `index.ts` barrels at feature boundary only.

```
web/src/
├── main.tsx                 # Standalone dev entry; mounts <IndexerApp /> with stub host.
├── bootstrap.tsx            # Async-boundary wrapper required by Module Federation.
├── IndexerApp/
│   ├── index.tsx            # The exposed component (forwardRef + useImperativeHandle).
│   ├── Providers.tsx        # Theme, QueryClient, HostContext, AppInsights, ErrorBoundary.
│   ├── RootShell.tsx        # Sidebar | main pane layout. Distributes events upward via onEvent.
│   └── IndexerApp.test.tsx
├── host/                    # Host-contract glue. Nothing here imports from features.
│   ├── HostContext.tsx
│   ├── useHost.ts
│   ├── stubHost.ts          # Dev-mode fake host for `npm run dev`.
│   └── types.ts             # Re-exports /shared/types/host-contract for ergonomics.
├── api/                     # HTTP client. No SSE — the indexer doesn't stream anything.
│   ├── client.ts            # fetch wrapper with auth, OperationId, ProblemDetails mapping.
│   ├── endpoints/           # collections.ts, folders.ts, documents.ts (metadata only).
│   └── queryKeys.ts         # TanStack Query key registry.
├── theme/
│   ├── tokens.ts
│   ├── ThemeProvider.tsx
│   └── prePaintScript.ts
├── features/
│   ├── collections/         # S1 — sidebar, CRUD, share dialog.
│   ├── folders/             # S2 — tree, create/rename/move/delete.
│   ├── fileList/            # S2 — table, sort, filter, search, bulk select, properties panel.
│   └── upload/              # S3 — drag/drop, walk, batch lifecycle, polling, banner, triage.
├── components/              # Cross-feature shared primitives — see shared-inventory.md.
├── hooks/                   # Cross-feature hooks — see shared-inventory.md.
├── utils/                   # Pure utilities — see shared-inventory.md.
├── styles/global.scss       # Token declarations, resets.
└── setupTests.ts            # jsdom polyfills (already present).
```

### 3.1 Feature folder rules (re-stated for clarity — full rule lives in `web-file-structure.md`)

- Each `features/<x>/` exposes only what it ships through `index.ts`. No deep imports from another feature.
- Cross-feature shared UI lives in `web/src/components/`. Cross-feature shared logic lives in `web/src/hooks/` or `web/src/utils/`.
- No feature imports from another feature. If two features need the same code, hoist it to `components/`, `hooks/`, or `utils/`.

### 3.2 What each feature owns

| Feature | Owns | Renders into | Public exports |
|---|---|---|---|
| `collections` | Sidebar list, create/rename/delete affordances, share dialog. | Sidebar slot. | `<CollectionsSidebar />`, `useActiveDocumentSet()`. |
| `folders` | Folder tree, create/rename/move/delete cascade, drop-target logic. | Main-pane left rail. | `<FolderTree />`, `useFolderDropTarget()`. |
| `fileList` | File table, filters, search, bulk select, properties panel; emits `document/selected` on row click. | Main-pane center. | `<FileList />`, `<DocumentPropertiesPanel />`. |
| `upload` | Drag-target overlay, file picker, folder walk, batch + polling state machine, progress banner, failure popover. | Overlays + bottom banner. | `<UploadDropzone />`, `<UploadProgressBanner />`, `useUploadController()`. |

### 3.3 State boundaries

- **Server state** — TanStack Query, owned by `api/` and consumed by features through hooks defined in each feature.
- **Per-collection UI state** (folder expansion, panel open/closed) — `usePersistedReducer` namespaced per `(userId, documentSetId)`. Owned by `RootShell` and the affected feature.
- **Upload-session state** — feature-local reducer in `features/upload/`. Never persisted.
- **Theme state** — `theme/ThemeProvider.tsx`, persisted via `localStorage` under the `theme-preference` key (per `web-persistence.md`).

No global Redux store. No Zustand. The complexity ceiling for this app is well within Context + reducer per `web-state-management.md`. If complexity grows during Step 3, Redux Toolkit becomes the escalation path — flag it before introducing.

---

## 4. Boundary enforcement

- The `eslint-plugin-import` rules `no-restricted-paths` and `no-cycle` are configured at the start of S1 to enforce:
  - `features/*` cannot import from another `features/*`.
  - `api/`, `host/`, `theme/`, `components/`, `hooks/`, `utils/` cannot import from `features/*`.
  - No file outside `host/` may import from `/shared/types/host-contract` directly — features go through `host/useHost.ts`.
- Lint violations fail CI per `web-linting-formatting.md`.

---

## 5. Module Federation runtime considerations

- The bootstrap `bootstrap.tsx` indirection is **mandatory** — Module Federation requires an async boundary at the root for shared module resolution.
- The exposed `./IndexerApp` is loaded by the host via the runtime API:
  ```ts
  // illustrative — host code, not in this repo
  const Indexer = await import('mws_indexer/IndexerApp');
  // optional ref usage:
  const ref = useRef<IndexerHandle>(null);
  <Indexer.default ref={ref} {...props} />;
  ref.current?.selectCollection(documentSetId);
  ```
- The indexer **does not** depend on the host's React. The shared singleton scope ensures only one React instance is loaded at runtime.
- The exposed component must be rendered inside the host's React tree but **outside** any Suspense boundary the host owns — the indexer brings its own.

---

## 6. Scaffold-time deviations (Step 2)

The scaffold is in place under `web/src/` and matches the layout in §3. Two deviations from this doc are deferred to slice S1; both are config-only and do not change the locked contracts:

- **Module Federation plugin** is **not yet installed**. The webpack config still builds a regular SPA. S1 adds `@module-federation/enhanced`, the `bootstrap.tsx` async boundary, and the `exposes` entries (`./IndexerApp`, `./types`). The `<IndexerApp />` component is already a `forwardRef` that accepts the documented props and exposes the documented `IndexerHandle`, so the consumer-facing surface is locked.
- **`eslint-plugin-import` `no-restricted-paths` / `no-cycle`** rules are **not yet configured**. S1 turns them on as documented in §4.

See `scaffold-notes.md` for the full list of scaffold-time decisions.

## 7. Out of scope for this template

- The consuming application that builds chat / citation / viewer features on top of the indexer.
- Any chat, SSE, conversation, citation, or document-content-rendering UI — those are the consuming app's responsibility.
- Vite-based federation. The choice of Webpack is locked.
- Module Federation v2 runtime API beyond what `@module-federation/enhanced` ships with — no custom runtime plugins in v1.
- The API project — it is a separate, already-built service. The indexer talks to it over HTTP only.
