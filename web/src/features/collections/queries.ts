import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDocumentSetRequest,
  DocumentSetResponse,
  GrantShareRequest,
  Paged,
  RenameDocumentSetRequest,
  ShareResponse,
  UserLookupResponse,
} from '@shared/types';
import {
  createDocumentSet,
  deleteDocumentSet,
  grantShare,
  listDocumentSets,
  listShares,
  renameDocumentSet,
  revokeShare,
} from '../../api/endpoints/collections';
import { lookupUserByEmail } from '../../api/endpoints/users';
import { useApiClient } from '../../hooks/useApiClient';
import { useEmitEvent } from '../../host/useHost';
import { queryKeys } from '../../api/queryKeys';

const PAGE_SIZE = 100;

export const useDocumentSetsList = () => {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.documentSets.list(),
    queryFn: ({ signal }) =>
      listDocumentSets(client, { page: 1, pageSize: PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
};

export const useCreateDocumentSet = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const emit = useEmitEvent();
  return useMutation<DocumentSetResponse, Error, CreateDocumentSetRequest>({
    mutationFn: (body) => createDocumentSet(client, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentSets.list() });
      emit({ type: 'collection/list-changed' });
    },
  });
};

interface RenameVars {
  documentSetId: string;
  body: RenameDocumentSetRequest;
}

export const useRenameDocumentSet = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const emit = useEmitEvent();
  return useMutation<DocumentSetResponse, Error, RenameVars>({
    mutationFn: ({ documentSetId, body }) =>
      renameDocumentSet(client, documentSetId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentSets.list() });
      emit({ type: 'collection/list-changed' });
    },
  });
};

export const useDeleteDocumentSet = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const emit = useEmitEvent();
  return useMutation<void, Error, string>({
    mutationFn: (documentSetId) => deleteDocumentSet(client, documentSetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentSets.list() });
      emit({ type: 'collection/list-changed' });
    },
  });
};

interface ShareGrantVars {
  documentSetId: string;
  body: GrantShareRequest;
}

export const useGrantShare = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<ShareResponse, Error, ShareGrantVars>({
    mutationFn: ({ documentSetId, body }) => grantShare(client, documentSetId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentSets.shares(variables.documentSetId),
      });
    },
  });
};

interface ShareRevokeVars {
  documentSetId: string;
  granteeUserId: string;
}

export const useRevokeShare = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ShareRevokeVars>({
    mutationFn: ({ documentSetId, granteeUserId }) =>
      revokeShare(client, documentSetId, granteeUserId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentSets.shares(variables.documentSetId),
      });
    },
  });
};

export const useDocumentSetShares = (documentSetId: string | null) => {
  const client = useApiClient();
  return useQuery<Paged<ShareResponse>>({
    queryKey: queryKeys.documentSets.shares(documentSetId ?? ''),
    queryFn: ({ signal }) =>
      listShares(client, documentSetId!, { page: 1, pageSize: PAGE_SIZE }).then(
        (result) => {
          if (signal?.aborted) throw signal.reason;
          return result;
        },
      ),
    enabled: documentSetId !== null,
  });
};

export const useUserLookup = (email: string) => {
  const client = useApiClient();
  return useQuery<UserLookupResponse | null>({
    queryKey: queryKeys.users.lookup(email),
    queryFn: ({ signal }) =>
      lookupUserByEmail(client, { email }, signal).catch((error: unknown) => {
        // Treat 404 as a clean "not found" rather than a thrown error.
        const status = (error as { normalized?: { status: number } }).normalized?.status;
        if (status === 404) return null;
        throw error;
      }),
    enabled: email.length > 3 && email.includes('@'),
    retry: false,
  });
};
