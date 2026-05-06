import type {
  DocumentDeleteAcceptedResponse,
  DocumentMetadataResponse,
  DocumentStatusResponse,
  UpdateDocumentRequest,
} from '@shared/types';
import type { ApiClient } from '../client';

// Endpoint wrappers for /documents/* — metadata and mutations only.
// The indexer never fetches document content (GET /documents/{id}/content);
// that is the consuming application's concern.

export const getDocumentMetadata = (
  client: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentMetadataResponse> =>
  client.get(`/documents/${encodeURIComponent(documentId)}`, { signal });

export const getDocumentStatus = (
  client: ApiClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentStatusResponse> =>
  client.post(`/documents/${encodeURIComponent(documentId)}/status`, undefined, { signal });

export const updateDocument = (
  client: ApiClient,
  documentId: string,
  body: UpdateDocumentRequest,
): Promise<DocumentMetadataResponse> =>
  client.patch(`/documents/${encodeURIComponent(documentId)}`, body);

export const deleteDocument = (
  client: ApiClient,
  documentId: string,
): Promise<DocumentDeleteAcceptedResponse> =>
  client.del(`/documents/${encodeURIComponent(documentId)}`);
