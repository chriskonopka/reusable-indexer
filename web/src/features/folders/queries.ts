import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFolderRequest,
  FolderDeleteAcceptedResponse,
  FolderResponse,
  FolderTreeResponse,
  MoveFolderRequest,
  RenameFolderRequest,
} from '@shared/types';
import {
  createFolder,
  deleteFolder,
  getFolderTree,
  moveFolder,
  renameFolder,
} from '../../api/endpoints/folders';
import { useApiClient } from '../../hooks/useApiClient';
import { queryKeys } from '../../api/queryKeys';

export const useFolderTree = (documentSetId: string | null) => {
  const client = useApiClient();
  return useQuery<FolderTreeResponse>({
    queryKey: queryKeys.folders.tree(documentSetId ?? ''),
    queryFn: ({ signal }) => getFolderTree(client, documentSetId!, signal),
    enabled: documentSetId !== null,
    staleTime: 30_000,
  });
};

interface CreateFolderVars {
  documentSetId: string;
  body: CreateFolderRequest;
}

export const useCreateFolder = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, Error, CreateFolderVars>({
    mutationFn: ({ documentSetId, body }) => createFolder(client, documentSetId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.tree(variables.documentSetId),
      });
    },
  });
};

interface RenameFolderVars {
  documentSetId: string;
  folderId: string;
  body: RenameFolderRequest;
}

export const useRenameFolder = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, Error, RenameFolderVars>({
    mutationFn: ({ documentSetId, folderId, body }) =>
      renameFolder(client, documentSetId, folderId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.tree(variables.documentSetId),
      });
    },
  });
};

interface MoveFolderVars {
  documentSetId: string;
  folderId: string;
  body: MoveFolderRequest;
}

export const useMoveFolder = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<FolderResponse, Error, MoveFolderVars>({
    mutationFn: ({ documentSetId, folderId, body }) =>
      moveFolder(client, documentSetId, folderId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.tree(variables.documentSetId),
      });
    },
  });
};

interface DeleteFolderVars {
  documentSetId: string;
  folderId: string;
}

export const useDeleteFolder = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<FolderDeleteAcceptedResponse, Error, DeleteFolderVars>({
    mutationFn: ({ documentSetId, folderId }) => deleteFolder(client, documentSetId, folderId),
    onSuccess: (_data, variables) => {
      // Invalidate the folder tree and any contents queries for this collection —
      // cascade delete may have removed documents from multiple folders.
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.tree(variables.documentSetId),
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'folders' && query.queryKey[1] === 'contents',
      });
    },
  });
};
