import type {
  BatchStatusDocument,
  FolderAggregateStatus,
  UploadFile,
} from '@shared/types';

// Pure helpers that derive UI-facing aggregate state from the upload session.

export interface ProgressTotals {
  total: number;
  indexed: number;
  failed: number;
  skipped: number;
}

export const computeTotals = (files: UploadFile[]): ProgressTotals => {
  let indexed = 0;
  let failed = 0;
  let skipped = 0;
  for (const file of files) {
    if (file.status === 'Indexed') indexed += 1;
    else if (file.status === 'Failed') failed += 1;
    else if (file.status === 'Unsupported' || file.status === 'Duplicate') skipped += 1;
  }
  return {
    total: files.length,
    indexed,
    failed,
    skipped,
  };
};

const folderAggregateKindFor = (
  ready: number,
  total: number,
  failed: number,
  skipped: number,
): FolderAggregateStatus['kind'] => {
  if (failed > 0) return 'has-failures';
  if (skipped > 0 && ready === total - skipped) return 'has-skips';
  if (total === 0) return 'idle';
  if (ready === total) return 'indexed-fading';
  // Anything between Queued and Ready is shown as `indexing` because the
  // bytes-in-flight phase ("Uploading") is short and the aggregate badge
  // does not split it out — `indexing` is the umbrella per spec 3.5.2.
  return 'indexing';
};

export const computeFolderAggregates = (
  files: UploadFile[],
): Map<string | null, FolderAggregateStatus> => {
  const buckets = new Map<string | null, UploadFile[]>();
  for (const file of files) {
    const key = file.targetFolderId ?? null;
    const list = buckets.get(key);
    if (list) list.push(file);
    else buckets.set(key, [file]);
  }
  const result = new Map<string | null, FolderAggregateStatus>();
  for (const [folderId, group] of buckets) {
    const total = group.length;
    let ready = 0;
    let failed = 0;
    let skipped = 0;
    for (const file of group) {
      if (file.status === 'Indexed') ready += 1;
      else if (file.status === 'Failed') failed += 1;
      else if (file.status === 'Unsupported' || file.status === 'Duplicate') skipped += 1;
    }
    result.set(folderId, {
      kind: folderAggregateKindFor(ready, total, failed, skipped),
      ready,
      total,
      failed,
      skipped,
    });
  }
  return result;
};

/**
 * Returns a map keyed by lowercased fileName for fast lookup from the file
 * list — bridges the gap between the upload session (which has no
 * `documentId` until the API responds) and the document rows the file list
 * renders. Scoped to a single folder to keep collisions across folders out.
 */
export const inProgressByFileName = (
  files: UploadFile[],
  folderId: string | null,
): Map<string, UploadFile> => {
  const result = new Map<string, UploadFile>();
  for (const file of files) {
    if ((file.targetFolderId ?? null) !== folderId) continue;
    if (file.status === 'Indexed' && file.documentId !== null) continue;
    result.set(file.file.name.toLowerCase(), file);
  }
  return result;
};

export const isStatusTerminal = (status: UploadFile['status']): boolean =>
  status === 'Indexed' ||
  status === 'Failed' ||
  status === 'Unsupported' ||
  status === 'Duplicate';

export const mapWireStatus = (
  wire: BatchStatusDocument['status'],
): UploadFile['status'] => {
  switch (wire) {
    case 'Pending':
      return 'Submitted';
    case 'Indexing':
      return 'Indexing';
    case 'Ready':
      return 'Indexed';
    case 'Failed':
      return 'Failed';
  }
};
