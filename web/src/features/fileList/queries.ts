import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentDeleteAcceptedResponse,
  DocumentMetadataResponse,
  LevelContentsResponse,
} from '@shared/types';
import { browseContents } from '../../api/endpoints/folders';
import { deleteDocument, getDocumentMetadata } from '../../api/endpoints/documents';
import { useApiClient } from '../../hooks/useApiClient';
import { queryKeys } from '../../api/queryKeys';

const PAGE_SIZE = 100;

export const useBrowseContents = (documentSetId: string, folderId: string | null) => {
  const client = useApiClient();
  return useQuery<LevelContentsResponse>({
    queryKey: queryKeys.folders.contents(documentSetId, folderId),
    queryFn: ({ signal }) =>
      browseContents(client, documentSetId, { folderId, page: 1, pageSize: PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
};

export const useDocumentMetadata = (documentId: string | null) => {
  const client = useApiClient();
  return useQuery<DocumentMetadataResponse>({
    queryKey: queryKeys.documents.metadata(documentId ?? ''),
    queryFn: ({ signal }) => getDocumentMetadata(client, documentId!, signal),
    enabled: documentId !== null,
    staleTime: 30_000,
  });
};

interface DeleteDocumentVars {
  documentSetId: string;
  documentId: string;
  folderId: string | null;
}

export const useDeleteDocument = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<DocumentDeleteAcceptedResponse, Error, DeleteDocumentVars>({
    mutationFn: ({ documentId }) => deleteDocument(client, documentId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.contents(variables.documentSetId, variables.folderId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.documents.metadata(variables.documentId),
      });
    },
  });
};
