/**
 * Wire DTOs for the GlobalIndexer API — only the endpoints the indexer
 * itself consumes.
 *
 * Out of scope for the indexer: chat, conversations, citations, SSE.
 * Those endpoints live in the API contract (/frontend-api-contract.md)
 * and are consumed by the consuming app, not by this indexer.
 *
 * Source of truth: /frontend-api-contract.md (root of repo).
 * Do not add fields the contract does not define.
 * If the wire contract changes, update this file FIRST, then the call sites.
 */

// =============================================================================
// Shared enums
// =============================================================================

export type DocumentStatus = 'Pending' | 'Indexing' | 'Ready' | 'Failed';

export type BatchStatus =
  | 'Pending'
  | 'InProgress'
  | 'Completed'
  | 'CompletedWithErrors';

export type AccessRole = 'Owner' | 'Shared';

export type FileTypeCode = 'Financial' | 'Contract' | 'Regulatory' | 'Other';

// =============================================================================
// Common envelope shapes
// =============================================================================

export interface PagedRequest {
  page: number;
  pageSize: number;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * RFC 7807 ProblemDetails. The `type` slugs the SPA switches on are
 * documented in /docs/architecture/api-contracts.md §1.3.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

// =============================================================================
// Users (share dialog only)
// =============================================================================

export interface UserLookupRequest {
  email: string;
}

export interface UserLookupResponse {
  userId: string;
  displayName: string;
}

// =============================================================================
// Document Sets (Collections in the UI)
// =============================================================================

export interface CreateDocumentSetRequest {
  name: string;
}

export interface RenameDocumentSetRequest {
  name: string;
}

export interface DocumentSetResponse {
  documentSetId: string;
  name: string;
  ownerUserId: string;
  accessRole: AccessRole;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSetSummary {
  documentSetId: string;
  name: string;
  accessRole: AccessRole;
  updatedAt: string;
}

export type ListDocumentSetsRequest = PagedRequest;

// =============================================================================
// Sharing
// =============================================================================

export interface GrantShareRequest {
  granteeUserId: string;
}

export interface ShareResponse {
  documentSetId: string;
  granteeUserId: string;
  granteeDisplayName: string;
  grantedByUserId: string;
  grantedAt: string;
}

// =============================================================================
// Folders
// =============================================================================

export interface CreateFolderRequest {
  name: string;
  parentFolderId: string | null;
}

export interface RenameFolderRequest {
  name: string;
}

export interface MoveFolderRequest {
  newParentFolderId: string | null;
}

export interface FolderResponse {
  folderId: string;
  documentSetId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderTreeNode {
  folderId: string;
  parentFolderId: string | null;
  name: string;
  children: FolderTreeNode[];
}

export interface FolderTreeResponse {
  documentSetId: string;
  roots: FolderTreeNode[];
}

export interface BrowseContentsRequest {
  folderId: string | null;
  page: number;
  pageSize: number;
}

export interface LevelContentsResponse {
  folderId: string | null;
  folders: FolderResponse[];
  documents: DocumentMetadataResponse[];
  folderCount: number;
  documentCount: number;
}

export interface FolderDeleteAcceptedResponse {
  folderId: string;
  affectedDocumentIds: string[];
}

// =============================================================================
// Documents (metadata + status only — content streaming is a consuming-app concern)
// =============================================================================

export interface DocumentMetadataResponse {
  documentId: string;
  documentSetId: string;
  batchId: string;
  folderId: string | null;
  fileName: string;
  fileType: FileTypeCode;
  /**
   * Auto-derived document classification (e.g. "regulatory", "report",
   * "other"). Null when classification was skipped, failed, or hasn't run
   * yet (e.g. status === 'Failed'). Distinct from `fileType` which is the
   * coarse file-format code.
   */
  documentType: string | null;
  /** Classifier confidence in [0, 1]. Null when `documentType` is null. */
  documentTypeConfidence: number | null;
  /** True when a user overrode the auto-classification. */
  manuallyClassified: boolean;
  contentType: string;
  fileSizeBytes: number;
  status: DocumentStatus;
  chunkCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  chunkCount: number | null;
  failureReason: string | null;
}

export interface DocumentAcceptedResponse {
  documentId: string;
  status: DocumentStatus;
}

export interface DocumentDeleteAcceptedResponse {
  documentId: string;
}

export interface UpdateDocumentRequest {
  fileType: FileTypeCode;
}

/**
 * Move a document into a different folder of the same document set.
 * `null` = move to the document-set root.
 *
 * Wire shape mirrors MoveFolderRequest: the API uses `newFolderId` here, not
 * `folderId`. The server updates AI Search chunk metadata as a best-effort
 * side effect so folder-scoped retrieval stays consistent across moves.
 *
 * Errors:
 * - 403 — caller does not own the document set
 * - 404 — document missing/soft-deleted OR target folder not in this set
 * - 409 — a document with the same filename already exists in the target folder
 */
export interface MoveDocumentRequest {
  newFolderId: string | null;
}

// =============================================================================
// Batches
// =============================================================================

export interface BatchResponse {
  batchId: string;
  documentSetId: string;
  status: BatchStatus;
  totalDocuments: number | null;
  createdAt: string;
}

export interface BatchStatusDocument {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  failureReason: string | null;
}

export interface BatchStatusResponse {
  batchId: string;
  status: BatchStatus;
  totalDocuments: number;
  documents: BatchStatusDocument[];
}
