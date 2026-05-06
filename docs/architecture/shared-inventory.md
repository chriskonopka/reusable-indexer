# Shared Inventory — Reusable Indexer (Frontend)

Every cross-cutting utility, primitive, and infra helper used by two or more features. Each lives at the location below, has a locked interface, and is owned by the slice that introduces it.

If a feature needs behavior that's not on this list, the answer is to add it here (with a re-review of this doc), not to duplicate inline.

> **Status: scaffolded (Step 2).** Every entry below has a signature-only stub at its documented Location. Calling a stub throws `<name>: not implemented (slice SN)` so misuse fails loudly and the next slice's first action is obvious. The directory READMEs (`web/src/utils/README.md`, `web/src/hooks/README.md`, `web/src/components/README.md`) are the in-tree pointers to this inventory.
>
> **S1 update (2026-05-05).** Slice 1 promoted the following entries from stub to real implementation: `Button`, `IconButton`, `Pill`, `Modal`, `Toast`/`ToastProvider`/`ToastViewport`, `EmptyState`, `Skeleton`, `ErrorBoundary` (already real, retyped), `usePersistedReducer`, `useApiClient`, `useFocusTrap`, `useKeyboardEscape`, `useToast`, `useDebouncedValue` (lifted forward from S2 — share dialog needs it), `normalizeError`, `idb`, `api/client.ts`, `api/queryKeys.ts`, `api/endpoints/{collections,users}.ts`, `theme/{tokens,ThemeProvider,prePaintScript}`, `host/{HostContext,useHost,stubHost,types}`. Stubs not yet implemented (deferred to S2/S3): `dateLabels`, `junkFileFilter`, `fileTypeFilter`, `folderPath`, `usePolling`. See [`01-slice-shell-collections.md`](./01-slice-shell-collections.md).
>
> **S2 update (2026-05-05).** Slice 2 promoted: `dateLabels` (real implementation), added new entry `fileSize` (`formatBytes`). Also added `api/endpoints/{folders,documents}.ts` and `queryKeys.folders.*` / `queryKeys.documents.*`. Stubs still not implemented: `junkFileFilter`, `fileTypeFilter`, `folderPath`, `usePolling` (all S3). See [`02-slice-folders-filelist.md`](./02-slice-folders-filelist.md).
>
> **S3 update (2026-05-06).** Slice 3 promoted the four remaining stubs to real implementations: `junkFileFilter`, `fileTypeFilter`, `folderPath`, `usePolling`. Added `api/endpoints/batches.ts` (`createBatch`, `completeBatch`, `getBatchStatus`, `uploadDocument`). The upload feature ships its own internal helpers in `web/src/features/upload/` and does not extend the cross-feature shared inventory. See [`03-slice-upload.md`](./03-slice-upload.md).

The inventory is grouped by:

- **§1 Cross-cutting utilities** — pure functions, no React.
- **§2 UI primitives** — shared React components.
- **§3 Hooks** — shared React hooks.
- **§4 Infra helpers** — HTTP client, theming, persistence, host glue.

The indexer scope is ingestion + collection management only. SSE parsers, chat primitives, viewer components, and PDF rendering are **not** in this inventory — those are the consuming application's concern.

---

## 1. Cross-cutting utilities (`web/src/utils/`)

### normalizeError
- Interface: `(unknown) => { type: string; title: string; status: number; detail: string; fieldErrors?: Record<string, string[]> }`
- Location: `web/src/utils/normalizeError.ts`
- Purpose: maps a thrown error from `fetch` or a ProblemDetails body into the stable shape every UI surface displays.
- Consumers: every feature that surfaces an error (collections, folders, fileList, upload).
- Introduced in: S1.

### dateLabels
- Interface: `relativeTimeLabel(iso: string, now?: Date): string` (e.g. "just now", "1m ago", "5m ago")
- Location: `web/src/utils/dateLabels.ts`
- Purpose: the auto-ticking relative-time labels in the file table and progress banner (spec 3.5.1).
- Consumers: fileList, upload.
- Introduced in: S2. **Promoted to real implementation in S2.**

### fileSize
- Interface: `formatBytes(bytes: number): string` — formats a byte count to a human-readable string (e.g. `"512.0 KB"`, `"1.4 MB"`).
- Location: `web/src/utils/fileSize.ts`
- Purpose: display file sizes in the file table and document properties panel.
- Consumers: fileList (FileList.tsx, DocumentPropertiesPanel.tsx).
- Introduced in: S2.

### junkFileFilter
- Interface: `isJunkFile(file: File | { name: string }): boolean`
- Location: `web/src/utils/junkFileFilter.ts`
- Purpose: drops `.DS_Store`, `thumbs.db`, `desktop.ini`, `.localized` (spec 3.4.3).
- Consumers: upload.
- Introduced in: S3.

### fileTypeFilter
- Interface:
  ```ts
  classify(file: { name: string; type: string; size: number }):
    | { kind: 'supported'; fileTypeCode: FileTypeCode; contentType: string }
    | { kind: 'unsupported'; reason: string }
    | { kind: 'too-large'; reason: string }
    | { kind: 'empty'; reason: string }
  ```
- Location: `web/src/utils/fileTypeFilter.ts`
- Purpose: client-side gate before `POST /documents` (spec 3.4.2/3.4.3, contract §2.4.3).
- Consumers: upload.
- Introduced in: S3.

### folderPath
- Interface:
  ```ts
  resolveTargetFolderId(args: {
    relativePath: string;
    rootFolderId: string | null;
    tree: FolderNode[];
    createMissing: (parentId: string | null, name: string) => Promise<string>;
  }): Promise<string | null>
  ```
- Location: `web/src/utils/folderPath.ts`
- Purpose: walks a dropped folder's relative path, creating subfolders via `POST /folders` as needed and returning the leaf folder ID for the file's `POST /documents` call (spec 3.4.5).
- Consumers: upload.
- Introduced in: S3.

### idb (IndexedDB wrapper)
- Interface:
  ```ts
  openIndexerDb(): Promise<IDBDatabase>;
  getValue<T>(store: string, key: string): Promise<T | undefined>;
  putValue<T>(store: string, key: string, value: T): Promise<void>;
  deleteValue(store: string, key: string): Promise<void>;
  ```
- Location: `web/src/utils/idb.ts`
- Purpose: the only place that talks to IndexedDB directly. Database name `mws-indexer`, single store per scope.
- Consumers: hooks/usePersistedReducer.
- Introduced in: S1.

---

## 2. UI primitives (`web/src/components/`)

All primitives consume the MWS branding tokens defined in `web/src/theme/tokens.ts` via CSS custom properties — no hard-coded colors or fonts (per `web-branding.md`).

### Button
- Interface: `<Button variant="primary" | "secondary" size?="default" | "small" loading? disabled? onClick? type? />`
- Location: `web/src/components/Button/`
- Purpose: the only sanctioned button. Implements MWS Primary/Secondary styles, ALL CAPS labels, hover states.
- Consumers: every feature.
- Introduced in: S1.

### IconButton
- Interface: `<IconButton icon={PhosphorIconComponent} ariaLabel={string} onClick? variant? />`
- Location: `web/src/components/IconButton/`
- Purpose: outline-weight Phosphor icons in a 24×24 hit area; navy on light, teal on dark (per branding rule).
- Consumers: every feature.
- Introduced in: S1.

### Pill
- Interface: `<Pill tone="info" | "success" | "warning" | "error" | "neutral" label={string} />`
- Location: `web/src/components/Pill/`
- Purpose: file-type badges (spec 3.7.1) and status pills (spec 3.5.1). Carries text label, never color-only (`web-accessibility.md`).
- Consumers: fileList, upload, folders, collections.
- Introduced in: S1.

### Modal
- Interface: `<Modal isOpen ariaLabel onClose>{children}</Modal>` with focus trap, return-focus on close, Escape to close.
- Location: `web/src/components/Modal/`
- Purpose: confirm dialogs (delete collection/folder/document), share dialog (spec 3.2.4, 3.3.5).
- Consumers: collections, folders, fileList.
- Introduced in: S1.

### Toast
- Interface: `useToast()` → `{ push: (message: string, tone: 'info'|'error'|'success') => void }`; `<ToastViewport />` rendered in `RootShell`.
- Location: `web/src/components/Toast/`
- Purpose: non-blocking error surface (spec 3.2.3 rename failure, transient API errors).
- Consumers: every feature.
- Introduced in: S1.

### EmptyState
- Interface: `<EmptyState icon? title body action? />`
- Location: `web/src/components/EmptyState/`
- Purpose: spec 3.8 empty states.
- Consumers: collections, fileList, upload (failure popover empty).
- Introduced in: S1.

### Skeleton
- Interface: `<Skeleton variant="row" | "rect" | "text" />`
- Location: `web/src/components/Skeleton/`
- Purpose: loading states for the file table and folder tree.
- Consumers: every feature.
- Introduced in: S1.

### ErrorBoundary (already exists at `web/src/ErrorBoundary.tsx`)
- Interface: `<ErrorBoundary fallback?={ReactNode} onError?={(error, info) => void}>{children}</ErrorBoundary>`
- Location: `web/src/components/ErrorBoundary/` — moved from `web/src/ErrorBoundary.tsx` in S1.
- Purpose: catches render-phase exceptions; reports through `onError` (which routes to `IndexerEvent('error/unhandled')`).
- Consumers: `IndexerApp/Providers`.
- Introduced in: pre-existing (move + retype in S1).

---

## 3. Hooks (`web/src/hooks/`)

### usePersistedReducer
- Interface: `usePersistedReducer<S, A>(reducer, initial, key): [S, Dispatch<A>]`
- Location: `web/src/hooks/usePersistedReducer.ts`
- Purpose: the only sanctioned IndexedDB-backed reducer (per `web-persistence.md`). Hydrates async; renders with `initial` first.
- Consumers: collections (last-active state), folders (expansion), upload (banner-expanded state), RootShell (sidebar collapse state).
- Introduced in: S1.

### useApiClient
- Interface: `useApiClient(): { get, post, patch, del, postMultipart }` — typed wrappers around `api/client.ts` that pull `apiBaseUrl` and `getAccessToken` from `host/useHost`.
- Location: `web/src/hooks/useApiClient.ts`
- Purpose: the single React-side entry point to the HTTP client.
- Consumers: every `api/endpoints/*.ts` consumer (i.e., all features through their query/mutation hooks).
- Introduced in: S1.

### usePolling
- Interface: `usePolling(fn: () => Promise<void>, opts: { intervalMs; enabled; pauseOnHidden? }): void`
- Location: `web/src/hooks/usePolling.ts`
- Purpose: the batch-status and single-document-status pollers (spec 3.5, contract §2.4.1). Pauses on `document.visibilityState !== 'visible'`.
- Consumers: upload, fileList (single-doc status when properties panel is open on an indexing doc).
- Introduced in: S3.

### useDebouncedValue
- Interface: `useDebouncedValue<T>(value: T, delayMs: number): T`
- Location: `web/src/hooks/useDebouncedValue.ts`
- Purpose: file-list filename search and share-dialog email lookup (spec 3.7.1, contract §2.1).
- Consumers: fileList, collections.
- Introduced in: S2.

### useFocusTrap
- Interface: `useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement>): void`
- Location: `web/src/hooks/useFocusTrap.ts`
- Purpose: Modal accessibility (`web-accessibility.md`).
- Consumers: components/Modal.
- Introduced in: S1.

### useKeyboardEscape
- Interface: `useKeyboardEscape(active: boolean, onEscape: () => void): void`
- Location: `web/src/hooks/useKeyboardEscape.ts`
- Purpose: spec 5.4 — Escape collapses the upload-progress panel; Escape closes Modal.
- Consumers: components/Modal, upload.
- Introduced in: S1.

### useToast
- Interface: see §2 Toast.
- Location: `web/src/hooks/useToast.ts` (Context provider) + `web/src/components/Toast/` (UI).
- Purpose: see Toast.
- Consumers: every feature.
- Introduced in: S1.

---

## 4. Infra helpers

### api/client.ts
- Interface:
  ```ts
  type ApiClient = {
    get<T>(path: string, opts?: { signal?: AbortSignal }): Promise<T>;
    post<T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }): Promise<T>;
    patch<T>(path: string, body: unknown, opts?: { signal?: AbortSignal }): Promise<T>;
    del<T>(path: string, opts?: { signal?: AbortSignal }): Promise<T>;
    postMultipart<T>(path: string, form: FormData, opts?: { signal?: AbortSignal }): Promise<T>;
  };
  createApiClient(opts: { apiBaseUrl: string; getAccessToken: () => Promise<string>; onAuthExpired: () => void; appInsights?: ApplicationInsights }): ApiClient;
  ```
- Location: `web/src/api/client.ts`
- Purpose: single fetch wrapper. Attaches Bearer token, captures `X-Operation-Id` from each response and logs it, parses ProblemDetails on non-2xx, raises `auth/expired` on `401`.
- Consumers: hooks/useApiClient and every `api/endpoints/*.ts`.
- Introduced in: S1.

### api/queryKeys.ts
- Interface: a single registry of TanStack Query keys (`["documentSets","list"]`, `["folders", documentSetId]`, etc.) so cache invalidation is type-safe.
- Location: `web/src/api/queryKeys.ts`
- Purpose: prevents string-typed key drift between callers and invalidators.
- Consumers: every `api/endpoints/*.ts` and feature hook.
- Introduced in: S1.

### api/endpoints/*.ts
- One file per resource the indexer consumes: `collections.ts`, `folders.ts`, `documents.ts` (metadata only). Each exports typed `useQuery` / `useMutation` hooks built on `useApiClient` and `queryKeys`.
- Introduced incrementally as each slice needs the resource.

### theme/tokens.ts
- Interface: `INDEXER_THEME_TOKENS_LIGHT: Record<ThemeTokenKey, string>`, `INDEXER_THEME_TOKENS_DARK: Record<ThemeTokenKey, string>`.
- Location: `web/src/theme/tokens.ts`
- Purpose: built-in MWS tokens. Host overrides merge over these (per host contract).
- Consumers: theme/ThemeProvider.
- Introduced in: S1.

### theme/ThemeProvider.tsx
- Interface: `<ThemeProvider initialTheme? overrides?>{children}</ThemeProvider>`
- Location: `web/src/theme/ThemeProvider.tsx`
- Purpose: writes CSS custom properties to a scoped element wrapper, applies `data-theme="light"|"dark"`, exposes `useTheme()` for the toggle.
- Consumers: IndexerApp/Providers.
- Introduced in: S1.

### theme/prePaintScript.ts
- Interface: a string template the standalone dev shell injects into `index.html` `<head>` to set the initial theme before first paint (per `web-performance.md`).
- Location: `web/src/theme/prePaintScript.ts`
- Purpose: prevents dark/light flash on initial load. In federated deployments the host owns first-paint theming; the indexer respects whatever theme attribute is present at mount.
- Consumers: dev `index.html`, `IndexerApp/Providers` (reconciles persisted theme on mount).
- Introduced in: S1.

### host/HostContext.tsx + host/useHost.ts
- Interface: `<HostContext.Provider value={IndexerAppProps}>` and `useHost(): IndexerAppProps`.
- Location: `web/src/host/`
- Purpose: makes the host props available to deep tree without prop drilling.
- Consumers: hooks/useApiClient, theme/ThemeProvider, IndexerApp/Providers, every feature that needs `appInsights` for logging or the `onEvent` callback to surface `IndexerEvent`s.
- Introduced in: S1.

### host/stubHost.ts
- Interface: `createStubHost(): IndexerAppProps` — supplies a fake `getAccessToken` that returns a placeholder token, an `apiBaseUrl` from `process.env`, and a no-op `onEvent`.
- Location: `web/src/host/stubHost.ts`
- Purpose: powers `npm run dev` standalone.
- Consumers: `web/src/main.tsx`.
- Introduced in: S1.

---

## 5. Anti-inventory — what we are **not** building

- No HTTP middleware/interceptor framework — the fetch wrapper is enough.
- No event bus / pub-sub — features communicate up to `RootShell` via callbacks; `RootShell` distributes via props and emits `IndexerEvent`s outward.
- No global Redux store. No Zustand, no Jotai. Context + reducer is the ceiling per `web-state-management.md`.
- No `react-router` — the indexer's "navigation" is internal state + the host's `IndexerEvent` and `IndexerHandle`. The host owns URL routing.
- No `axios`, `superagent`, etc. — native `fetch` only (`web-state-management.md`).
- No `uuid`, `nanoid` — `crypto.randomUUID()` per `web-component-architecture.md`.
- No styling library (Tailwind, styled-components, Emotion) — SCSS modules + CSS custom properties only (`web-styling.md`).
- No `date-fns` / `dayjs` — `dateLabels.ts` does the small set of relative-time labels we need.
- No SSE parser, EventSource wrapper, or chat-streaming primitives — chat is the consuming application's concern.
- No PDF library (`pdfjs-dist`), image-render helpers, or text-extraction helpers — viewer is the consuming application's concern.
- No splitter / panel-drag component — the indexer doesn't render a chat or viewer panel, so there's nothing to split.

Adding any of the above requires a re-review of this doc.
