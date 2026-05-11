import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentMetadataResponse,
  MoveDocumentRequest,
} from '@shared/types';

import { moveDocument } from '../api/endpoints/documents';
import { queryKeys } from '../api/queryKeys';
import { useApiClient } from './useApiClient';

// Move a document between folders. Lives in src/hooks/ (not features/) because
// both the FileList (drag source) and the FolderTree (drop target) need access,
// and features cannot import from each other per module-boundaries §3.1.

interface MoveDocumentVars {
  documentSetId: string;
  documentId: string;
  /** The folder the document is in BEFORE the move. Used to invalidate the
   *  source folder's contents query in addition to the destination. */
  sourceFolderId: string | null;
  body: MoveDocumentRequest;
}

export const useMoveDocument = () => {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<DocumentMetadataResponse, Error, MoveDocumentVars>({
    mutationFn: ({ documentId, body }) => moveDocument(client, documentId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.contents(
          variables.documentSetId,
          variables.sourceFolderId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.contents(
          variables.documentSetId,
          variables.body.newFolderId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.tree(variables.documentSetId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.metadata(variables.documentId),
      });
    },
  });
};
