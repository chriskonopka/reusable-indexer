// What belongs here: the type-safe TanStack Query key registry so cache
// invalidation never drifts between callers and invalidators.
// See shared-inventory.md §4 and data-model.md §2.4.
// Implementation lands in slice S1.

export const queryKeys = {
  documentSets: {
    list: () => ['documentSets', 'list'] as const,
    detail: (documentSetId: string) =>
      ['documentSets', 'detail', documentSetId] as const,
    shares: (documentSetId: string) =>
      ['documentSets', 'shares', documentSetId] as const,
  },
  folders: {
    tree: (documentSetId: string) =>
      ['folders', 'tree', documentSetId] as const,
    contents: (documentSetId: string, folderId: string | null) =>
      ['folders', 'contents', documentSetId, folderId] as const,
  },
  documents: {
    metadata: (documentId: string) => ['documents', 'metadata', documentId] as const,
    status: (documentId: string) => ['documents', 'status', documentId] as const,
  },
  batches: {
    status: (batchId: string) => ['batches', 'status', batchId] as const,
  },
  users: {
    lookup: (email: string) => ['users', 'lookup', email] as const,
  },
} as const;
