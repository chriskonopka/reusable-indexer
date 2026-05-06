import type {
  BrowseContentsRequest,
  CreateFolderRequest,
  FolderDeleteAcceptedResponse,
  FolderResponse,
  FolderTreeResponse,
  LevelContentsResponse,
  MoveFolderRequest,
  RenameFolderRequest,
} from '@shared/types';
import type { ApiClient } from '../client';

// Endpoint wrappers for the /document-sets/{id}/folders and /contents family.
// Pure functions over ApiClient — features wrap them with TanStack Query hooks.

export const getFolderTree = (
  client: ApiClient,
  documentSetId: string,
  signal?: AbortSignal,
): Promise<FolderTreeResponse> =>
  client.get(
    `/document-sets/${encodeURIComponent(documentSetId)}/folders`,
    { signal },
  );

export const browseContents = (
  client: ApiClient,
  documentSetId: string,
  body: BrowseContentsRequest,
  signal?: AbortSignal,
): Promise<LevelContentsResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/contents`,
    body,
    { signal },
  );

export const createFolder = (
  client: ApiClient,
  documentSetId: string,
  body: CreateFolderRequest,
): Promise<FolderResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/folders`,
    body,
  );

export const renameFolder = (
  client: ApiClient,
  documentSetId: string,
  folderId: string,
  body: RenameFolderRequest,
): Promise<FolderResponse> =>
  client.patch(
    `/document-sets/${encodeURIComponent(documentSetId)}/folders/${encodeURIComponent(folderId)}`,
    body,
  );

export const moveFolder = (
  client: ApiClient,
  documentSetId: string,
  folderId: string,
  body: MoveFolderRequest,
): Promise<FolderResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/folders/${encodeURIComponent(folderId)}/move`,
    body,
  );

export const deleteFolder = (
  client: ApiClient,
  documentSetId: string,
  folderId: string,
): Promise<FolderDeleteAcceptedResponse> =>
  client.del(
    `/document-sets/${encodeURIComponent(documentSetId)}/folders/${encodeURIComponent(folderId)}`,
  );
