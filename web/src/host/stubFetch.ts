// In-memory fetch shim for the dev shell. Activated when the URL contains
// ?stub=1 so Playwright e2e can drive flows without a live backend. Never
// shipped to production — the consuming application supplies its own
// `getAccessToken` and the indexer hits the real API.
//
// Implements endpoints exercised by S1 (collections, shares) and S2
// (folder tree, browse contents, document CRUD).

interface DocumentSetRow {
  documentSetId: string;
  name: string;
  ownerUserId: string;
  accessRole: 'Owner' | 'Shared';
  createdAt: string;
  updatedAt: string;
}

interface ShareRow {
  documentSetId: string;
  granteeUserId: string;
  granteeDisplayName: string;
  grantedByUserId: string;
  grantedAt: string;
}

interface FolderRow {
  folderId: string;
  documentSetId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentRow {
  documentId: string;
  documentSetId: string;
  batchId: string;
  folderId: string | null;
  fileName: string;
  fileType: 'Financial' | 'Contract' | 'Regulatory' | 'Other';
  contentType: string;
  fileSizeBytes: number;
  status: 'Pending' | 'Indexing' | 'Ready' | 'Failed';
  chunkCount: number | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000001';

const buildResponse = (status: number, body: unknown): Response => {
  const init: ResponseInit = {
    status,
    headers: {
      'content-type': 'application/json',
      'X-Operation-Id': crypto.randomUUID(),
    },
  };
  return new Response(body === undefined ? null : JSON.stringify(body), init);
};

const problem = (status: number, slug: string, detail: string): Response =>
  buildResponse(status, {
    type: `https://problems.api/${slug}`,
    title: slug,
    status,
    detail,
  });

interface BatchRow {
  batchId: string;
  documentSetId: string;
  status: 'Pending' | 'InProgress' | 'Completed' | 'CompletedWithErrors';
  totalDocuments: number | null;
  createdAt: string;
}

interface State {
  collections: DocumentSetRow[];
  shares: ShareRow[];
  folders: FolderRow[];
  documents: DocumentRow[];
  batches: BatchRow[];
  /**
   * Server-side polling tick counter per document — drives the simulated
   * progression Pending → Indexing → Ready over a few polls so that the
   * Playwright suite can observe each transition.
   */
  documentTicks: Map<string, number>;
}

const seedState = (): State => ({
  collections: [],
  shares: [],
  folders: [],
  documents: [],
  batches: [],
  documentTicks: new Map(),
});

export const installStubFetch = (): void => {
  const state = seedState();

  const handleCollections = (
    method: string,
    path: string,
    body: unknown,
  ): Response | null => {
    if (path === '/document-sets/list' && method === 'POST') {
      return buildResponse(200, {
        items: state.collections.map(({ documentSetId, name, accessRole, updatedAt }) => ({
          documentSetId,
          name,
          accessRole,
          updatedAt,
        })),
        totalCount: state.collections.length,
        page: 1,
        pageSize: 100,
      });
    }
    if (path === '/document-sets' && method === 'POST') {
      const { name } = body as { name: string };
      const now = new Date().toISOString();
      const row: DocumentSetRow = {
        documentSetId: crypto.randomUUID(),
        name,
        ownerUserId: DEFAULT_OWNER_ID,
        accessRole: 'Owner',
        createdAt: now,
        updatedAt: now,
      };
      state.collections = [row, ...state.collections];
      // Seed sample folder + documents for the new collection.
      const rootFolderId = crypto.randomUUID();
      state.folders.push({
        folderId: rootFolderId,
        documentSetId: row.documentSetId,
        parentFolderId: null,
        name: 'Contracts',
        createdAt: now,
        updatedAt: now,
      });
      state.documents.push({
        documentId: crypto.randomUUID(),
        documentSetId: row.documentSetId,
        batchId: crypto.randomUUID(),
        folderId: rootFolderId,
        fileName: 'sample-contract.pdf',
        fileType: 'Contract',
        contentType: 'application/pdf',
        fileSizeBytes: 512 * 1024,
        status: 'Ready',
        chunkCount: 5,
        createdAt: now,
        updatedAt: now,
      });
      state.documents.push({
        documentId: crypto.randomUUID(),
        documentSetId: row.documentSetId,
        batchId: crypto.randomUUID(),
        folderId: null,
        fileName: 'overview.pdf',
        fileType: 'Other',
        contentType: 'application/pdf',
        fileSizeBytes: 256 * 1024,
        status: 'Ready',
        chunkCount: 2,
        createdAt: now,
        updatedAt: now,
      });
      return buildResponse(201, row);
    }
    const detailMatch = path.match(/^\/document-sets\/([^/]+)$/);
    if (detailMatch) {
      const id = decodeURIComponent(detailMatch[1]);
      const idx = state.collections.findIndex((row) => row.documentSetId === id);
      if (idx === -1) return problem(404, 'not-found', 'Collection not found.');
      if (method === 'GET') return buildResponse(200, state.collections[idx]);
      if (method === 'PATCH') {
        const { name } = body as { name: string };
        state.collections[idx] = {
          ...state.collections[idx],
          name,
          updatedAt: new Date().toISOString(),
        };
        return buildResponse(200, state.collections[idx]);
      }
      if (method === 'DELETE') {
        state.collections = state.collections.filter((row) => row.documentSetId !== id);
        state.shares = state.shares.filter((row) => row.documentSetId !== id);
        return buildResponse(204, undefined);
      }
    }
    return null;
  };

  const handleShares = (
    method: string,
    path: string,
    body: unknown,
  ): Response | null => {
    const listMatch = path.match(/^\/document-sets\/([^/]+)\/shares\/list$/);
    if (listMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(listMatch[1]);
      const items = state.shares.filter((row) => row.documentSetId === documentSetId);
      return buildResponse(200, { items, totalCount: items.length, page: 1, pageSize: 100 });
    }
    const grantMatch = path.match(/^\/document-sets\/([^/]+)\/shares$/);
    if (grantMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(grantMatch[1]);
      const { granteeUserId } = body as { granteeUserId: string };
      const exists = state.shares.find(
        (row) => row.documentSetId === documentSetId && row.granteeUserId === granteeUserId,
      );
      if (exists) return problem(409, 'share-already-exists', 'That user already has access.');
      // Derive display name from the stub userId — the user lookup endpoint
      // creates IDs of the form `stub-{email}`, so the display name is the
      // email's local-part. Falls back to the raw id if the format ever changes.
      const emailPart = granteeUserId.startsWith('stub-')
        ? granteeUserId.slice('stub-'.length).split('@')[0]
        : granteeUserId;
      const row: ShareRow = {
        documentSetId,
        granteeUserId,
        granteeDisplayName: emailPart,
        grantedByUserId: DEFAULT_OWNER_ID,
        grantedAt: new Date().toISOString(),
      };
      state.shares.push(row);
      return buildResponse(201, row);
    }
    const revokeMatch = path.match(
      /^\/document-sets\/([^/]+)\/shares\/([^/]+)$/,
    );
    if (revokeMatch && method === 'DELETE') {
      const documentSetId = decodeURIComponent(revokeMatch[1]);
      const granteeUserId = decodeURIComponent(revokeMatch[2]);
      state.shares = state.shares.filter(
        (row) => !(row.documentSetId === documentSetId && row.granteeUserId === granteeUserId),
      );
      return buildResponse(204, undefined);
    }
    return null;
  };

  const buildFolderTree = (documentSetId: string) => {
    const dsFolder = state.folders.filter((row) => row.documentSetId === documentSetId);
    const buildNodes = (parentId: string | null): unknown[] =>
      dsFolder
        .filter((row) => row.parentFolderId === parentId)
        .map((row) => ({
          folderId: row.folderId,
          parentFolderId: row.parentFolderId,
          name: row.name,
          children: buildNodes(row.folderId),
        }));
    return { documentSetId, roots: buildNodes(null) };
  };

  const handleFolders = (
    method: string,
    path: string,
    body: unknown,
  ): Response | null => {
    const treeMatch = path.match(/^\/document-sets\/([^/]+)\/folders$/);
    if (treeMatch && method === 'GET') {
      const documentSetId = decodeURIComponent(treeMatch[1]);
      return buildResponse(200, buildFolderTree(documentSetId));
    }
    if (treeMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(treeMatch[1]);
      const { name, parentFolderId = null } = body as { name: string; parentFolderId?: string | null };
      const now = new Date().toISOString();
      const row: FolderRow = {
        folderId: crypto.randomUUID(),
        documentSetId,
        parentFolderId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      state.folders.push(row);
      return buildResponse(201, row);
    }
    const folderDetailMatch = path.match(/^\/document-sets\/([^/]+)\/folders\/([^/]+)$/);
    if (folderDetailMatch) {
      const documentSetId = decodeURIComponent(folderDetailMatch[1]);
      const folderId = decodeURIComponent(folderDetailMatch[2]);
      const idx = state.folders.findIndex(
        (row) => row.documentSetId === documentSetId && row.folderId === folderId,
      );
      if (idx === -1) return problem(404, 'not-found', 'Folder not found.');
      if (method === 'PATCH') {
        const { name } = body as { name: string };
        state.folders[idx] = { ...state.folders[idx], name, updatedAt: new Date().toISOString() };
        return buildResponse(200, state.folders[idx]);
      }
      if (method === 'DELETE') {
        const affectedIds: string[] = [];
        const removeDescendants = (id: string) => {
          state.folders
            .filter((row) => row.parentFolderId === id)
            .forEach((child) => removeDescendants(child.folderId));
          state.folders = state.folders.filter((row) => row.folderId !== id);
          const affected = state.documents
            .filter((doc) => doc.folderId === id)
            .map((doc) => doc.documentId);
          affectedIds.push(...affected);
          state.documents = state.documents.filter((doc) => doc.folderId !== id);
        };
        removeDescendants(folderId);
        return buildResponse(202, { folderId, affectedDocumentIds: affectedIds });
      }
    }
    const moveMatch = path.match(/^\/document-sets\/([^/]+)\/folders\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(moveMatch[1]);
      const folderId = decodeURIComponent(moveMatch[2]);
      const { newParentFolderId } = body as { newParentFolderId: string | null };
      const idx = state.folders.findIndex(
        (row) => row.documentSetId === documentSetId && row.folderId === folderId,
      );
      if (idx === -1) return problem(404, 'not-found', 'Folder not found.');
      state.folders[idx] = {
        ...state.folders[idx],
        parentFolderId: newParentFolderId,
        updatedAt: new Date().toISOString(),
      };
      return buildResponse(200, state.folders[idx]);
    }
    const contentsMatch = path.match(/^\/document-sets\/([^/]+)\/contents$/);
    if (contentsMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(contentsMatch[1]);
      const { folderId } = body as { folderId: string | null };
      const folders = state.folders
        .filter((row) => row.documentSetId === documentSetId && row.parentFolderId === folderId)
        .map((row) => ({ ...row }));
      const documents = state.documents
        .filter((doc) => doc.documentSetId === documentSetId && doc.folderId === folderId)
        .map((doc) => ({ ...doc }));
      return buildResponse(200, {
        folderId,
        folders,
        documents,
        folderCount: folders.length,
        documentCount: documents.length,
      });
    }
    return null;
  };

  const handleDocuments = (method: string, path: string): Response | null => {
    const docMatch = path.match(/^\/documents\/([^/]+)$/);
    if (docMatch) {
      const documentId = decodeURIComponent(docMatch[1]);
      if (method === 'GET') {
        const doc = state.documents.find((row) => row.documentId === documentId);
        if (!doc) return problem(404, 'not-found', 'Document not found.');
        return buildResponse(200, doc);
      }
      if (method === 'DELETE') {
        const exists = state.documents.some((row) => row.documentId === documentId);
        if (!exists) return problem(404, 'not-found', 'Document not found.');
        state.documents = state.documents.filter((row) => row.documentId !== documentId);
        return buildResponse(202, { documentId });
      }
    }
    return null;
  };

  const advanceDocumentTick = (documentId: string): void => {
    const next = (state.documentTicks.get(documentId) ?? 0) + 1;
    state.documentTicks.set(documentId, next);
    const doc = state.documents.find((row) => row.documentId === documentId);
    if (!doc) return;
    if (doc.status === 'Failed' || doc.status === 'Ready') return;
    if (next === 1) doc.status = 'Indexing';
    if (next >= 2) doc.status = 'Ready';
  };

  // ---------------------------------------------------------------------------
  // Upload pipeline: batches + multipart documents + status polling.
  //
  // Test hooks via window.__stubControls (see below) let Playwright force the
  // next upload to fail (transient-then-recover) for the retry test.
  // ---------------------------------------------------------------------------

  interface StubControls {
    failNext: number; // count of upcoming POST /documents calls to fail
    failNextWith: 'transient' | 'permanent';
    seedDocumentSet: (name: string) => string;
    /**
     * Seeds a Shared (read-only viewer) collection with a single sample
     * folder and document so the read-only e2e suite has something to
     * render. Does NOT seed a batch — read-only viewers cannot upload.
     */
    seedSharedCollection: (name: string) => string;
  }
  const stubControls: StubControls = {
    failNext: 0,
    failNextWith: 'transient',
    seedDocumentSet: (name: string) => {
      const now = new Date().toISOString();
      const row: DocumentSetRow = {
        documentSetId: crypto.randomUUID(),
        name,
        ownerUserId: DEFAULT_OWNER_ID,
        accessRole: 'Owner',
        createdAt: now,
        updatedAt: now,
      };
      state.collections = [row, ...state.collections];
      return row.documentSetId;
    },
    seedSharedCollection: (name: string) => {
      const now = new Date().toISOString();
      const row: DocumentSetRow = {
        documentSetId: crypto.randomUUID(),
        name,
        ownerUserId: 'someone-else',
        accessRole: 'Shared',
        createdAt: now,
        updatedAt: now,
      };
      state.collections = [row, ...state.collections];
      const folderId = crypto.randomUUID();
      state.folders.push({
        folderId,
        documentSetId: row.documentSetId,
        parentFolderId: null,
        name: 'Shared docs',
        createdAt: now,
        updatedAt: now,
      });
      state.documents.push({
        documentId: crypto.randomUUID(),
        documentSetId: row.documentSetId,
        batchId: crypto.randomUUID(),
        folderId,
        fileName: 'shared-with-you.pdf',
        fileType: 'Other',
        contentType: 'application/pdf',
        fileSizeBytes: 64 * 1024,
        status: 'Ready',
        chunkCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      return row.documentSetId;
    },
  };
  (window as unknown as { __stubControls?: StubControls }).__stubControls = stubControls;

  const handleBatches = (
    method: string,
    path: string,
  ): Response | null => {
    const createMatch = path.match(/^\/document-sets\/([^/]+)\/batches$/);
    if (createMatch && method === 'POST') {
      const documentSetId = decodeURIComponent(createMatch[1]);
      const row: BatchRow = {
        batchId: crypto.randomUUID(),
        documentSetId,
        status: 'Pending',
        totalDocuments: null,
        createdAt: new Date().toISOString(),
      };
      state.batches.push(row);
      return buildResponse(201, row);
    }
    const completeMatch = path.match(
      /^\/document-sets\/([^/]+)\/batches\/([^/]+)\/complete$/,
    );
    if (completeMatch && method === 'POST') {
      const batchId = decodeURIComponent(completeMatch[2]);
      const idx = state.batches.findIndex((row) => row.batchId === batchId);
      if (idx === -1) return problem(404, 'not-found', 'Batch not found.');
      const docs = state.documents.filter((row) => row.batchId === batchId);
      state.batches[idx] = {
        ...state.batches[idx],
        status: 'InProgress',
        totalDocuments: docs.length,
      };
      return buildResponse(200, state.batches[idx]);
    }
    const statusMatch = path.match(
      /^\/document-sets\/([^/]+)\/batches\/([^/]+)\/status$/,
    );
    if (statusMatch && method === 'POST') {
      const batchId = decodeURIComponent(statusMatch[2]);
      const batch = state.batches.find((row) => row.batchId === batchId);
      if (!batch) return problem(404, 'not-found', 'Batch not found.');
      const docs = state.documents.filter((row) => row.batchId === batchId);
      // Advance each document one tick per status poll.
      for (const doc of docs) advanceDocumentTick(doc.documentId);

      const allTerminal = docs.every(
        (doc) => doc.status === 'Ready' || doc.status === 'Failed',
      );
      const anyFailed = docs.some((doc) => doc.status === 'Failed');
      if (allTerminal && batch.status !== 'Pending' && docs.length > 0) {
        batch.status = anyFailed ? 'CompletedWithErrors' : 'Completed';
      }

      return buildResponse(200, {
        batchId: batch.batchId,
        status: batch.status,
        totalDocuments: batch.totalDocuments ?? docs.length,
        documents: docs.map((doc) => ({
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: doc.status,
          failureReason: doc.status === 'Failed' ? 'Could not extract document.' : null,
        })),
      });
    }
    return null;
  };

  const handleMultipartUpload = async (
    method: string,
    path: string,
    init: RequestInit | undefined,
  ): Promise<Response | null> => {
    if (path !== '/documents' || method !== 'POST') return null;

    const form = init?.body;
    if (!(form instanceof FormData)) {
      return problem(400, 'validation-failed', 'Multipart body required.');
    }

    if (stubControls.failNext > 0) {
      stubControls.failNext -= 1;
      if (stubControls.failNextWith === 'permanent') {
        return problem(400, 'unsupported-content-type', 'Stub: unsupported.');
      }
      return problem(502, 'blob-unavailable', 'Stub: blob temporarily unavailable.');
    }

    const documentSetId = (form.get('documentSetId') as string) ?? '';
    const batchId = (form.get('batchId') as string) ?? '';
    const folderId = (form.get('folderId') as string) || null;
    const fileType = (form.get('fileType') as DocumentRow['fileType']) ?? 'Other';
    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) {
      return problem(400, 'validation-failed', 'File field required.');
    }
    if (!state.batches.some((row) => row.batchId === batchId)) {
      return problem(404, 'not-found', 'Batch not found.');
    }
    const duplicate = state.documents.find(
      (row) =>
        row.documentSetId === documentSetId &&
        row.folderId === folderId &&
        row.fileName === fileEntry.name,
    );
    if (duplicate) {
      return problem(409, 'duplicate-filename', 'A file with that name already exists here.');
    }

    const now = new Date().toISOString();
    const row: DocumentRow = {
      documentId: crypto.randomUUID(),
      documentSetId,
      batchId,
      folderId,
      fileName: fileEntry.name,
      fileType,
      contentType: fileEntry.type || 'application/octet-stream',
      fileSizeBytes: fileEntry.size,
      status: 'Pending',
      chunkCount: null,
      createdAt: now,
      updatedAt: now,
    };
    state.documents.push(row);
    return buildResponse(202, { documentId: row.documentId, status: row.status });
  };

  const handleUsers = (method: string, path: string, body: unknown): Response | null => {
    if (path === '/users/lookup' && method === 'POST') {
      const { email } = body as { email: string };
      if (!email || !email.includes('@')) {
        return problem(400, 'validation-failed', 'A valid email is required.');
      }
      // Deterministic stub user — same email always resolves to the same id.
      return buildResponse(200, {
        userId: `stub-${email.toLowerCase()}`,
        displayName: email.split('@')[0],
      });
    }
    return null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stubbed = async (input: any, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body =
      init?.body && !(init.body instanceof FormData) ? safeParse(init.body) : undefined;

    const upload = await handleMultipartUpload(method, path, init);
    if (upload) return upload;

    return (
      handleCollections(method, path, body) ??
      handleShares(method, path, body) ??
      handleFolders(method, path, body) ??
      handleBatches(method, path) ??
      handleDocuments(method, path) ??
      handleUsers(method, path, body) ??
      problem(404, 'not-found', `Stub fetch: no route for ${method} ${path}`)
    );
  };

  Object.defineProperty(window, 'fetch', {
    value: stubbed,
    configurable: true,
    writable: true,
  });
};

const safeParse = (value: BodyInit): unknown => {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const isStubModeRequested = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('stub') === '1';
  } catch {
    return false;
  }
};
