# API Contracts — Reusable Indexer (Frontend)

**Authoritative source:** `frontend-api-contract.md` at the repo root, generated from the live GlobalIndexer API.

This document is **scoped to the endpoints the reusable indexer itself consumes** — collections, folders, documents (metadata + status only), batches, sharing, and user lookup. The Conversations and Chat (SSE) endpoints from the API contract are **out of indexer scope** — they are consumed by the consuming application that composes chat / citations / viewer on top of the indexer. The indexer supports those features through its host contract (see `module-boundaries.md` §2), not by implementing them.

If the wire-level contract and this doc disagree, the wire contract wins. If a behavior is not in the wire contract, do not invent it — ask.

---

## 1. Cross-cutting frontend rules

### 1.1 Authentication

- Every request except `GET /health` (which the SPA does not call) requires `Authorization: Bearer <jwt>`.
- The reusable indexer **does not perform login**. The host application provides a `getAccessToken(): Promise<string>` callback through the host contract (see `module-boundaries.md` §2 and `/shared/types/host-contract.ts`).
- The HTTP client calls `getAccessToken()` once per request — no caching of tokens inside the indexer. The host owns refresh.
- On `401`: surface `IndexerEvent('auth/expired')` to the host. Do not silently retry; do not show a login UI.

### 1.2 OperationId correlation

- Every request **and** response carries an `X-Operation-Id` header.
- The indexer reads the value from each response and logs it as a structured property on every Application Insights event raised for that request — same pattern the API uses (`api-logging.md`).
- The indexer **does not generate** the value on the client. It is opaque to the SPA.

### 1.3 Error envelope (RFC 7807)

All errors return ProblemDetails. Stable `type` slugs the UI switches on:

| Slug | UI behavior |
|---|---|
| `validation-failed` | Show field errors inline. `errors` map drives field highlighting. |
| `forbidden` | Treat as "you can't see this." Hide the resource. **Never** distinguish from "not found" in user-facing copy. |
| `not-found` | Same UI treatment as `forbidden` — generic "this isn't here anymore." |
| `conflict` | Surface the `detail` text inline (e.g., "Folder name already in use"). |
| `document-set-delete-blocked` | Show "Upload in progress — finish before deleting" tooltip on the delete affordance (spec 3.2.4). |
| `share-already-exists` | Inline message in share dialog. |
| `folder-move-cycle` | Visual rejection of drop target during drag (spec 3.3.4). |
| `blob-unavailable` | Mark the file `Failed` in upload session; surface in failure popover. Retryable. |
| `document-too-large` | Reject pre-upload client-side (50 MB limit, spec 3.4.3). If the server still emits this, mark file `Failed` with the same humanized reason. |
| `unsupported-content-type` | Map to client pseudo-status `Unsupported` (yellow accent, spec 3.6.3). |
| `duplicate-filename` | Map to client pseudo-status `Duplicate` (informational, spec 3.5.1). |

Slugs that exist in the wire contract but the indexer never triggers (`llm-unavailable`, `search-unavailable`) are out of indexer scope.

**Forbidden behaviors:**
- Never surface raw HTTP status codes, internal exception messages, or stack traces.
- Never construct `detail` text on the client — always render the server-provided value.
- Never log request bodies or response bodies that may contain user content (spec PII rules + `api-pii-handling.md`).

### 1.4 Pagination

- Default `pageSize = 20`, max 100. Requests above 100 fail with `400`.
- The SPA never lazy-loads beyond the user's explicit scroll/click — no infinite scroll without a corresponding wire `page` increment.
- The folder tree (`GET /folders`) is **not** paginated; it returns the full tree.

### 1.5 Caching headers

- All authenticated responses set `Cache-Control: private, no-store`. The SPA must not cache responses in the browser HTTP cache; rely on TanStack Query's in-memory cache only.

---

## 2. Endpoints consumed (grouped by feature slice)

### 2.1 Collections (S1)

| Method | Path | Purpose | Body / params | Notes |
|---|---|---|---|---|
| `POST` | `/document-sets/list` | Sidebar load | `{ page, pageSize }` | Sort by `updatedAt` desc client-side (server already returns in this order). |
| `POST` | `/document-sets` | Create | `{ name }` | Auto-name "New collection N" client-side; submit on Enter or blur. |
| `GET` | `/document-sets/{id}` | Detail (rare — only used after deep-link recovery) | — | |
| `PATCH` | `/document-sets/{id}` | Rename | `{ name }` | Optimistic update; revert on `4xx`. |
| `DELETE` | `/document-sets/{id}` | Delete (owner only) | — | Confirm dialog. Block when `409 document-set-delete-blocked`. |
| `POST` | `/users/lookup` | Resolve email → user (share dialog) | `{ email }` | Rate-limited (`UsersLookup` policy) — debounce input before calling. Concrete debounce value finalized in S1. |
| `POST` | `/document-sets/{id}/shares` | Grant | `{ granteeUserId }` | Owner only. |
| `POST` | `/document-sets/{id}/shares/list` | List grants (share dialog) | `{ page, pageSize }` | |
| `DELETE` | `/document-sets/{id}/shares/{granteeUserId}` | Revoke | — | Owner only. |

### 2.2 Folders (S2)

| Method | Path | Purpose | Body / params | Notes |
|---|---|---|---|---|
| `GET` | `/document-sets/{id}/folders` | Full tree | — | One call per collection switch. |
| `POST` | `/document-sets/{id}/contents` | Browse one level | `{ folderId, page, pageSize }` | `folderId: null` = root. Drives the file table. |
| `POST` | `/document-sets/{id}/folders` | Create | `{ name, parentFolderId }` | Inline create on hover affordance (spec 3.3.2). |
| `PATCH` | `/document-sets/{id}/folders/{folderId}` | Rename | `{ name }` | Optimistic. |
| `POST` | `/document-sets/{id}/folders/{folderId}/move` | Move (drag-and-drop target) | `{ newParentFolderId }` | Optimistic; revert on `409 folder-move-cycle`. |
| `DELETE` | `/document-sets/{id}/folders/{folderId}` | Cascade delete (owner) | — | Returns `202` + `affectedDocumentIds`. UI invalidates document caches in that subtree. **Lift mode is not in scope — see C5.** |

### 2.3 Documents — metadata only (S2 + S3)

> The indexer does **not** call `GET /documents/{id}/content`. Streaming the file body is the consuming application's concern (it embeds its own viewer). The indexer reads metadata to render the file list and properties panel; it never fetches the original bytes.

| Method | Path | Purpose | Body / params | Notes |
|---|---|---|---|---|
| `GET` | `/documents/{id}` | Metadata (properties panel) | — | |
| `PATCH` | `/documents/{id}` | Update `fileType` | `{ fileType }` | Only `fileType` is mutable. `fileName` and `folderId` immutable post-upload. |
| `DELETE` | `/documents/{id}` | Soft-delete (owner) | — | Returns `202`. |

### 2.4 Upload (S3)

> Upload is async. The frontend does **not** wait for processing — it submits, then polls. See `web-document-upload.md` for the cross-layer rule and `data-model.md` §2.1 for the upload-session state shape.

| Method | Path | Purpose | Body / params | Notes |
|---|---|---|---|---|
| `POST` | `/document-sets/{id}/batches` | Create batch | empty | Returns `batchId`; one batch per upload session. |
| `POST` | `/documents` | Upload one file | `multipart/form-data` with `documentSetId`, `batchId`, `folderId?`, `fileType`, `file` | One call per file. |
| `POST` | `/document-sets/{id}/batches/{batchId}/complete` | Signal done | empty | One call after **all** files are submitted. Idempotent. |
| `POST` | `/document-sets/{id}/batches/{batchId}/status` | Poll batch + per-doc status | empty | See §2.4.1. |
| `POST` | `/documents/{id}/status` | Poll one doc | empty | Used when the user opens the file's properties panel and it's still indexing. |

#### 2.4.1 Polling cadence

- **Batch status:** poll on a fixed cadence (`web-document-upload.md` says "every few seconds"; the concrete cadence is finalized in S3 implementation) while the batch is `Pending` or `InProgress`. Stop when `Completed` or `CompletedWithErrors`. Cadence is fixed once chosen; do not back off.
- **Single document status:** same cadence as the batch poller, used only when the user has the properties panel open on a `Pending`/`Indexing` document.
- The poller pauses while the browser tab is hidden (`document.visibilityState !== 'visible'`) and resumes on visibility change.

#### 2.4.2 Concurrency

- The SPA submits up to **5 files concurrently** (default per `web-document-upload.md`). When a slot frees, the next queued file starts immediately.
- The SPA continues remaining uploads on per-file failure (spec 3.4 + `web-document-upload.md`).

#### 2.4.3 Client-side gating before `POST /documents`

The frontend rejects files that violate spec 3.4.2 / 3.4.3 **before** they reach the API:
- File extension not in the supported list → `Unsupported` pseudo-status.
- File size > 50 MB → `Failed` with reason "File too large — 50 MB max."
- Junk-file names (`.DS_Store`, `thumbs.db`, `.localized`, `desktop.ini`) → silently filtered out, never shown.
- Empty files (0 bytes) → `Failed` with reason "Empty file."

---

## 3. Endpoints **not** consumed by the indexer

For clarity — the wire contract documents these endpoints, and the indexer explicitly does not call them. They exist for the consuming application or for infrastructure:

| Endpoint group | Why not in the indexer |
|---|---|
| `GET /health` | Infrastructure probe; not for SPAs. |
| `POST /users/admin-lookup` | Admin-only; not part of any SPA workflow. |
| `GET /documents/{id}/content` | Document-body streaming. The consuming application embeds its own viewer and fetches content directly. |
| All `/conversations/*` endpoints | Conversation lifecycle is the consuming application's concern. |
| `POST /document-sets/{id}/conversations/{id}/messages` (SSE) | Chat streaming is the consuming application's concern. |

---

## 4. Conflicts (cross-reference)

The full Conflict Log lives in `data-model.md` §5. Conflicts that affected the indexer's surface:

- **C5** Folder lift mode → not in API; not in v1 UI. Cascade-only delete.
- **C6** Granular per-file pipeline statuses → 7 client-shown labels mapped from 4 wire statuses + 2 client-derived.
- **C8** Document metadata gaps (page count, filing date, friendly title, classification confidence) → `—` in UI.
- **C11** Move-document-between-folders not in v1 — `folderId` immutable post-upload per the contract.

Conflicts that previously affected the indexer (chat status events, citation audit, OCR fallback, model picker, conversation strategy, viewer rendering of DOCX) are now **out of indexer scope** — they belong to the consuming application. They remain logged for traceability.

---

## 5. Versioning

Per `api/CLAUDE.md`: "No API versioning — breaking changes are coordinated, not versioned." The indexer SPA is built against the contract dated 2026-05-04 (the version in `frontend-api-contract.md`). When the wire contract changes, the SPA's contract types in `/shared/types/api.ts` must be updated **first**, types must compile, then the calling code is migrated. Do not add transitional shims that read both shapes.
