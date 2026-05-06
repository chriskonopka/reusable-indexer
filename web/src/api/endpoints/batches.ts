import type {
  BatchResponse,
  BatchStatusResponse,
  DocumentAcceptedResponse,
  FileTypeCode,
} from '@shared/types';
import type { ApiClient } from '../client';

// Endpoint wrappers for the upload pipeline (batches + multipart documents).
// See /docs/architecture/api-contracts.md §2.4 and frontend-api-contract.md.

export const createBatch = (
  client: ApiClient,
  documentSetId: string,
): Promise<BatchResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/batches`,
    undefined,
  );

export const completeBatch = (
  client: ApiClient,
  documentSetId: string,
  batchId: string,
): Promise<BatchResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/batches/${encodeURIComponent(
      batchId,
    )}/complete`,
    undefined,
  );

export const getBatchStatus = (
  client: ApiClient,
  documentSetId: string,
  batchId: string,
  signal?: AbortSignal,
): Promise<BatchStatusResponse> =>
  client.post(
    `/document-sets/${encodeURIComponent(documentSetId)}/batches/${encodeURIComponent(
      batchId,
    )}/status`,
    undefined,
    { signal },
  );

export interface UploadDocumentArgs {
  documentSetId: string;
  batchId: string;
  folderId: string | null;
  fileType: FileTypeCode;
  file: File;
  signal?: AbortSignal;
}

export const uploadDocument = (
  client: ApiClient,
  args: UploadDocumentArgs,
): Promise<DocumentAcceptedResponse> => {
  const form = new FormData();
  form.append('documentSetId', args.documentSetId);
  form.append('batchId', args.batchId);
  if (args.folderId) form.append('folderId', args.folderId);
  form.append('fileType', args.fileType);
  form.append('file', args.file, args.file.name);
  return client.postMultipart('/documents', form, { signal: args.signal });
};
