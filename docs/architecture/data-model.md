# Data Model — Reusable Indexer (Frontend)

**Scope:** This document describes the in-memory and persisted data the reusable indexer SPA holds. The indexer is responsible for **ingestion + collection management only** — collections, folders, documents (metadata + status), batches, sharing. Chat, conversations, citations, and document-body viewing are **out of indexer scope** — they belong to the consuming application that mounts `<IndexerApp />`.

The authoritative system of record for every persistent entity is the GlobalIndexer API (see `api-contracts.md` and `frontend-api-contract.md`). Server schema lives in the API project; the frontend never owns durable state for these entities.

The frontend has three categories of state:
1. **Server-mirrored entities** — fetched from the API, cached in TanStack Query, never persisted across sessions.
2. **Client-only state** — UI state (selection, filters, expansion) held in IndexedDB or React state.
3. **Ephemeral session state** — upload progress; lost on tab close.

---

## 1. Server-mirrored entities

Each entity below maps 1:1 to a wire DTO in `/shared/types/api.ts`. The frontend never invents fields the server doesn't provide; "computed" fields are derived locally and named explicitly.

### 1.1 DocumentSet (= Collection in the spec)

> Spec calls this a "Collection." API calls it a `DocumentSet`. The UI label is "Collection." Internally the type is `DocumentSet` to match the wire.

| Field | Type | Source | Notes |
|---|---|---|---|
| `documentSetId` | `string (uuid)` | API | Stable identity. |
| `name` | `string` | API | Editable by owner. |
| `ownerUserId` | `string (uuid)` | API | Entra `sub`. |
| `accessRole` | `'Owner' \| 'Shared'` | API | Drives every mutating-affordance gate. |
| `createdAt` / `updatedAt` | `ISO 8601 UTC` | API | Sort by `updatedAt` desc. |

**Computed (frontend only):**
- `documentCount` — sourced from `LevelContentsResponse.documentCount` at root level when available; otherwise unknown and shown as `—`.
- `isReadOnly` — `accessRole !== 'Owner'`.

**Constraints:**
- Every collection has exactly one owner. Read-only viewers see the collection in their sidebar with `accessRole = 'Shared'` and **no mutating affordances rendered**. Spec 2.1.
- `documentSetId` is the cache key for every nested resource (folders, batches).
- The active `documentSetId` is also broadcast to the consuming application via `IndexerEvent('collection/activated')`.

### 1.2 Folder

| Field | Type | Source | Notes |
|---|---|---|---|
| `folderId` | `string (uuid)` | API | |
| `documentSetId` | `string (uuid)` | API | Scope. |
| `parentFolderId` | `string (uuid) \| null` | API | `null` = root level. |
| `name` | `string` | API | Leaf name only — no path. |
| `createdAt` / `updatedAt` | `ISO 8601 UTC` | API | |

**Computed (frontend only):**
- `path` — derived by walking parents up the tree (held in normalized state, never sent to API). Used for visual indentation only.
- `aggregateStatus` — see §1.3 derived from child documents. Spec 3.5.2.
- `isExpanded` — UI state, IndexedDB-persisted per (user, collection).

**Constraints:**
- Folder hierarchy must be acyclic — enforced server-side (`409 folder-move-cycle`). Frontend disables drop targets visibly during drag.
- Folder names are not unique within a parent on the wire; the UI does not enforce uniqueness either — spec is silent.

### 1.3 Document

| Field | Type | Source | Notes |
|---|---|---|---|
| `documentId` | `string (uuid)` | API | |
| `documentSetId` | `string (uuid)` | API | |
| `batchId` | `string (uuid)` | API | The batch that uploaded it. |
| `folderId` | `string (uuid) \| null` | API | `null` = root of collection. Immutable post-upload. |
| `fileName` | `string` | API | Immutable post-upload. |
| `fileType` | `'Financial' \| 'Contract' \| 'Regulatory' \| 'Other'` | API | Editable via `PATCH /documents/{id}`. |
| `contentType` | `string (MIME)` | API | |
| `fileSizeBytes` | `number` | API | |
| `status` | `'Pending' \| 'Indexing' \| 'Ready' \| 'Failed'` | API | Drives row state. |
| `chunkCount` | `number \| null` | API | |
| `failureReason` | `string \| null` | Status poll | Plain-language label per spec 3.6.1. |
| `createdAt` / `updatedAt` | `ISO 8601 UTC` | API | |

**Note:** the indexer does **not** fetch document content (`GET /documents/{id}/content`). The consuming application is responsible for rendering document bodies in its own viewer; the indexer surfaces metadata only.

**Client-derived pseudo-statuses** (do not exist on the wire):
- `'Duplicate'` — derived from `409 duplicate-filename` response when uploading. Held only in the upload-session store, not in the document cache. Spec 3.5.1.
- `'Unsupported'` — derived from `400 unsupported-content-type` response, or rejected client-side before upload. Same lifetime as `Duplicate`. Spec 3.5.1.

**Mapped UI labels** (single source of truth in `/shared/types/domain.ts`):
- `Pending` → "Queued"
- `Indexing` → "Indexing…" (when folded, the granular phases listed in spec 3.5.1 — parsing/chunking/embedding/etc. — are not exposed by the API and therefore not shown; see Conflict Log below).
- `Ready` → "Indexed" (transient green badge auto-fades after 8s — spec 3.5.1)
- `Failed` → "Failed" + reason

### 1.4 Batch (= UploadBatch on the wire)

| Field | Type | Source | Notes |
|---|---|---|---|
| `batchId` | `string (uuid)` | API | |
| `documentSetId` | `string (uuid)` | API | |
| `status` | `'Pending' \| 'InProgress' \| 'Completed' \| 'CompletedWithErrors'` | API | |
| `totalDocuments` | `number \| null` | API | Set after `/complete`. |
| `createdAt` | `ISO 8601 UTC` | API | |

**Lifecycle:** session-scoped — the frontend creates one batch per upload session and discards the reference once the batch reaches `Completed` or `CompletedWithErrors`. Spec 3.4.1, 3.5.3.

### 1.5 Share (read-only viewer grant)

| Field | Type | Source | Notes |
|---|---|---|---|
| `documentSetId` | `string (uuid)` | API | |
| `granteeUserId` | `string (uuid)` | API | |
| `granteeDisplayName` | `string` | API | |
| `grantedByUserId` | `string (uuid)` | API | |
| `grantedAt` | `ISO 8601 UTC` | API | |

### 1.6 UserLookup

Used only in the share dialog; never cached.

| Field | Type | Source | Notes |
|---|---|---|---|
| `userId` | `string (uuid)` | API | |
| `displayName` | `string` | API | |

---

## 2. Client-only state

### 2.1 Upload session (ephemeral, in-memory only)

One per active upload session. Lives in a reducer; never persisted; cleared when the batch reaches a terminal status.

| Field | Type | Notes |
|---|---|---|
| `batchId` | `string \| null` | Created lazily on the first file. |
| `targetDocumentSetId` | `string` | Pinned at session start. Spec 3.4.6. |
| `files` | `UploadFile[]` | One row per accepted or rejected file. |
| `aggregateStatus` | `'Idle' \| 'Uploading' \| 'Completing' \| 'Completed' \| 'CompletedWithErrors' \| 'Failed'` | Drives the bottom banner (3.5.3). |
| `bannerExpanded` | `boolean` | Persisted across screens within session. |

**`UploadFile`:**
| Field | Type | Notes |
|---|---|---|
| `clientId` | `string (uuid)` | Generated via `crypto.randomUUID()` (no `uuid` lib — see `web-component-architecture.md`). |
| `file` | `File` | Browser File handle. |
| `relativePath` | `string` | From `webkitRelativePath` or DataTransfer entry walk. |
| `targetFolderId` | `string \| null` | Resolved by walking the folder tree at upload time. |
| `clientStatus` | `'Queued' \| 'Uploading' \| 'Submitted' \| 'Duplicate' \| 'Unsupported' \| 'Failed' \| 'Indexing' \| 'Indexed'` | See domain mapping. |
| `documentId` | `string \| null` | Returned by `POST /documents`. Null until submitted. |
| `failureReason` | `string \| null` | Plain-language. |
| `retryable` | `boolean` | True for transient HTTP failures only. |

### 2.2 Per-collection UI state (IndexedDB-persisted)

Keyed by `(userId, documentSetId)`; namespaced under `'mws-indexer'`.

| Field | Type | Notes |
|---|---|---|
| `expandedFolderIds` | `string[]` | Folder tree expansion state. |

(The indexer does not own a chat panel or document viewer, so no splitter, panel-open, or viewer-state fields live here. Those are the consuming application's concern.)

### 2.3 Per-user UI state (IndexedDB-persisted)

Keyed by `userId`.

| Field | Type | Notes |
|---|---|---|
| `lastActiveDocumentSetId` | `string \| null` | Spec 3.2.1, 5.3. |
| `sidebarCollapsed` | `boolean` | Spec 3.2.1, 5.3. |
| `themePreference` | `'light' \| 'dark' \| 'system'` | Spec 5.2. **Stored in `localStorage` (key `theme-preference`), not IndexedDB**, so the inline `<head>` script can read it before first paint — see `web-persistence.md`. |

### 2.4 In-memory query cache

TanStack Query is the only server-state cache. Stale times below are **defaults** — they may be tuned per query during implementation.

| Query | Stale time (default) | Refetch on focus | Notes |
|---|---|---|---|
| `documentSets/list` | 30 s | yes | Sidebar driver. |
| `folders/{documentSetId}` | 30 s | no | Whole tree per call. |
| `contents/{documentSetId}/{folderId\|null}` | 10 s | no | Paginated. |
| `documents/{documentId}` | 10 s | no | Loaded on properties panel open. |
| `batches/{batchId}/status` | always stale (poll loop) | n/a | Manual interval, not query refetch. |
| `users/lookup/{email}` | never cached | — | Share dialog only. |

---

## 3. Persistence rules

- **Sensitive data (tokens, document content, message text, PII) never touches IndexedDB or `localStorage`.** Compliance with `web-persistence.md` and `api-pii-handling.md`.
- **`localStorage` is reserved for `theme-preference` only.** All other client state goes through IndexedDB via `usePersistedReducer`.
- **`crypto.randomUUID()`** is used for all client-side IDs. No `uuid`/`nanoid` packages — `web-component-architecture.md`.

---

## 4. Constraints inherited from the API contract

- **Ownership:** every operation on a `DocumentSet` the caller does not own/share returns `403`, never `404`. Frontend treats both as "you can't see this collection," but logs `403` distinctly for telemetry — `frontend-api-contract.md` §Conventions.
- **Pagination:** all list endpoints cap at `pageSize=100`. Frontend default = 20.
- **Upload streaming:** the API streams the file straight to Blob Storage. The frontend uses `multipart/form-data` and never base64-encodes — keeps memory flat and matches the contract.
- **Idempotent `/complete`:** safe to retry. The frontend always retries once on transient failure of `/complete` before treating it as a hard failure.

---

## 5. Conflict Log (frontend ↔ spec ↔ API)

These conflicts surface gaps where the spec and the API disagree. After the scope was clarified to ingestion-only, several previous entries fell out of scope — they are retained below for traceability and marked accordingly. The remaining live conflicts (C5, C6, C8, C11) affect the indexer's surface and are resolved for v1; rows marked **Open** require an API change before the corresponding feature can ship.

| ID | Topic | Spec says | API provides | Frontend resolution (v1) | Status |
|---|---|---|---|---|---|
| **C1** | Active conversation per (user, collection) | One persistent thread per (user, collection) (4.2.5) | Many conversations per (user, collection) | **Out of indexer scope** — chat is the consuming app's concern. | Out of scope (consuming app) |
| **C2** | Citation audit (strikethrough unverified) | Verify the cited quote exists on the page; strike if not (4.3.2) | API returns bbox only; no `quote` text | **Out of indexer scope** — citations are the consuming app's concern. | Out of scope (consuming app) |
| **C3** | Citation cross-page fallback search | Scan all pages and land on the actual page (4.5.5) | No `quote` text on the wire | **Out of indexer scope** — citations are the consuming app's concern. | Out of scope (consuming app) |
| **C4** | OCR fallback for scanned PDFs | Run OCR client-side when no text layer exists (4.5.7) | n/a | **Out of indexer scope** — viewer is the consuming app's concern. | Out of scope (consuming app) |
| **C5** | Lift vs cascade folder delete | Two-mode delete: cascade or lift (3.3.5) | `DELETE /folders/{id}` is recursive cascade only | v1 ships **cascade only**, with a confirm dialog labeled "Delete folder and all documents inside." A "Lift contents" affordance is **not rendered**. | Open — needs API support (e.g., bulk move children to parent) before lift can ship |
| **C6** | Granular per-file pipeline statuses | 12 status states (3.5.1) | 4 wire states + 2 client-derived | Show 7 states: Queued / Uploading… / Indexing… / Indexed / Failed / Duplicate / Skipped. Granular `Indexing…` sub-phases not surfaced. | Open — would need API status streaming |
| **C7** | Chat status row phases | 5 named phases with fallback rotation cycle (4.2.3) | SSE has only `token \| citation \| error` | **Out of indexer scope** — chat is the consuming app's concern. | Out of scope (consuming app) |
| **C8** | Document metadata gaps (page count, filing date, friendly title, classification confidence) | Each appears in the file table or properties panel (3.7.1, 3.7.3) | None on `DocumentMetadataResponse` | Show `—` for all four. The properties panel surfaces only the fields the API returns. | Open — needs API extension |
| **C9** | Model picker (Quick / Balanced / Powerful) | Acceptance criterion 6 mentions a model picker | API allows `LlmProvider: Claude \| OpenAi` | **Out of indexer scope** — model selection is the consuming app's concern. | Out of scope (consuming app) |
| **C10** | Search history scoped per (user, collection) | Spec 2.1 mentions search history is scoped per (user, collection) | No `/search` history endpoint | Filename filter (4.4.1) is local and ephemeral — that's the indexer's only "search." Semantic search history belongs to the consuming app. | Resolved (split between layers) |
| **C11** | Move documents between folders | Owner can drag a document row into a folder row to move it (3.3.6) | `PATCH /documents/{id}` only allows `fileType`; `folderId` is documented as immutable post-upload | The drag-target on document rows is **not rendered** in v1. The spec text is unimplementable against the current contract. | Open — needs API support for moving a document |
| **C12** | RTF / DOCX / scanned-PDF rendering | Render strategies per format (4.5.4–4.5.7) | n/a | **Out of indexer scope** — viewer is the consuming app's concern. | Out of scope (consuming app) |

The four **Open** rows (C5, C6, C8, C11) each block a specific spec feature inside the indexer's surface. **None of them block v1 from shipping the slice plan in `slice-plan.md`** — the affected affordances are simply not rendered.
