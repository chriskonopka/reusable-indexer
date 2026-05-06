import type {
  DocumentSetResponse,
  ListDocumentSetsRequest,
  Paged,
  RenameDocumentSetRequest,
  CreateDocumentSetRequest,
  DocumentSetSummary,
  ShareResponse,
  GrantShareRequest,
  PagedRequest,
} from '@shared/types';
import type { ApiClient } from '../client';

// Endpoint wrappers for the /document-sets/* family. These are pure functions
// over an ApiClient instance — features wrap them with TanStack Query hooks
// inside features/collections.

export const listDocumentSets = (
  client: ApiClient,
  body: ListDocumentSetsRequest,
  signal?: AbortSignal,
): Promise<Paged<DocumentSetSummary>> =>
  client.post('/document-sets/list', body, { signal });

export const getDocumentSet = (
  client: ApiClient,
  documentSetId: string,
  signal?: AbortSignal,
): Promise<DocumentSetResponse> =>
  client.get(`/document-sets/${encodeURIComponent(documentSetId)}`, { signal });

export const createDocumentSet = (
  client: ApiClient,
  body: CreateDocumentSetRequest,
): Promise<DocumentSetResponse> => client.post('/document-sets', body);

export const renameDocumentSet = (
  client: ApiClient,
  documentSetId: string,
  body: RenameDocumentSetRequest,
): Promise<DocumentSetResponse> =>
  client.patch(`/document-sets/${encodeURIComponent(documentSetId)}`, body);

export const deleteDocumentSet = (
  client: ApiClient,
  documentSetId: string,
): Promise<void> =>
  client.del(`/document-sets/${encodeURIComponent(documentSetId)}`);

export const grantShare = (
  client: ApiClient,
  documentSetId: string,
  body: GrantShareRequest,
): Promise<ShareResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/shares`,
    body,
  );

export const listShares = (
  client: ApiClient,
  documentSetId: string,
  body: PagedRequest,
): Promise<Paged<ShareResponse>> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/shares/list`,
    body,
  );

export const revokeShare = (
  client: ApiClient,
  documentSetId: string,
  granteeUserId: string,
): Promise<void> =>
  client.del(
    `/document-sets/${encodeURIComponent(documentSetId)}/shares/${encodeURIComponent(granteeUserId)}`,
  );
