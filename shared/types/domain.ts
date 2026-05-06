/**
 * Domain types — UI-facing shapes computed or derived from wire DTOs.
 *
 * These are NOT on the wire. They normalize, narrow, or extend the raw
 * API DTOs in /shared/types/api.ts for use inside React components.
 *
 * Scope: ingestion + collection management only. Chat / viewer / citation
 * domain types are out of scope for this indexer.
 */

import type {
  AccessRole,
  BatchStatus,
  DocumentStatus,
  FileTypeCode,
} from './api';

// =============================================================================
// Display labels (single source of truth for UI text)
// =============================================================================

/**
 * Per-file labels rendered in the file table and progress banner.
 *
 * Spec 3.5.1 lists 12 lifecycle states; the API surfaces 4 plus 2
 * client-derived. The 7 below are the labels shipped in v1 — see
 * Conflict Log entry C6 in /docs/architecture/data-model.md.
 */
export type FileDisplayStatus =
  | 'Queued'
  | 'Uploading'
  | 'Indexing'
  | 'Indexed'
  | 'Failed'
  | 'Duplicate'
  | 'Skipped';

export type FailureSeverity = 'Skip' | 'Fail';

// =============================================================================
// Collections
// =============================================================================

export interface Collection {
  documentSetId: string;
  name: string;
  accessRole: AccessRole;
  isReadOnly: boolean;
  updatedAt: string;
}

// =============================================================================
// Folders
// =============================================================================

export interface FolderNode {
  folderId: string;
  documentSetId: string;
  parentFolderId: string | null;
  name: string;
  /** Pre-computed leaf-to-root path; never sent to the API. */
  pathSegments: string[];
  children: FolderNode[];
}

export interface FolderAggregateStatus {
  /** Mirrors spec 3.5.2 badge states. */
  kind:
    | 'idle'
    | 'uploading'
    | 'indexing'
    | 'indexed-fading'
    | 'has-failures'
    | 'has-skips';
  ready: number;
  total: number;
  failed: number;
  skipped: number;
}

// =============================================================================
// Documents (display)
// =============================================================================

export interface DocumentRow {
  documentId: string;
  documentSetId: string;
  folderId: string | null;
  fileName: string;
  fileType: FileTypeCode;
  contentType: string;
  fileSizeBytes: number;
  apiStatus: DocumentStatus;
  displayStatus: FileDisplayStatus;
  failureReason: string | null;
  /** Indexed-pill auto-fades 8 s after first appearance — spec 3.5.1. */
  indexedAt: string | null;
  createdAt: string;
}

// =============================================================================
// Upload session (in-memory only)
// =============================================================================

export interface UploadFile {
  /** Generated via crypto.randomUUID(); not the server documentId. */
  clientId: string;
  file: File;
  /** Path relative to the dropped/picked root, OS-style separators stripped. */
  relativePath: string;
  /** Resolved at upload time by walking/creating folders in the collection. */
  targetFolderId: string | null;
  status:
    | 'Queued'
    | 'Uploading'
    | 'Submitted'
    | 'Indexing'
    | 'Indexed'
    | 'Failed'
    | 'Duplicate'
    | 'Unsupported';
  documentId: string | null;
  failureReason: string | null;
  severity: FailureSeverity | null;
  retryable: boolean;
}

export interface UploadSessionState {
  batchId: string | null;
  targetDocumentSetId: string;
  files: UploadFile[];
  aggregateStatus: BatchStatus | 'Idle' | 'Failed';
  bannerExpanded: boolean;
}
