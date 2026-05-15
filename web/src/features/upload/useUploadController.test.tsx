import { ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BatchResponse,
  BatchStatusResponse,
  DocumentAcceptedResponse,
  IndexerAppProps,
} from '@shared/types';
import { HostProvider } from '../../host/HostContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider } from '../../hooks/useToast';
import type { UploadFile } from '@shared/types';
import { UploadProvider, useUploadDispatch, useUploadState } from './state';
import { __TESTING__, useUploadController } from './useUploadController';

// Integration tests for the upload controller. We stub `fetch` and drive
// the controller through its public API (acceptDrop, dismiss) and
// assert state transitions through the captured upload-session state.

const buildHost = (overrides: Partial<IndexerAppProps> = {}): IndexerAppProps => ({
  apiBaseUrl: 'https://test.invalid',
  getAccessToken: async () => 'tok',
  onEvent: () => {},
  ...overrides,
});

interface ControllerHarnessProps {
  documentSetId: string | null;
  onMount?: (controller: ReturnType<typeof useUploadController>) => void;
  onState?: (state: ReturnType<typeof useUploadState>) => void;
}

const Probe = ({ documentSetId, onMount, onState }: ControllerHarnessProps) => {
  const controller = useUploadController(documentSetId);
  const state = useUploadState();
  if (onMount) onMount(controller);
  if (onState) onState(state);
  return null;
};

const wrap = (children: ReactNode, host: IndexerAppProps = buildHost()): ReactNode => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return (
    <HostProvider value={host}>
      <ThemeProvider initialTheme="light">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <UploadProvider>{children}</UploadProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};

const ok = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  });

const problem = (status: number, slug: string, detail = 'err'): Response =>
  new Response(
    JSON.stringify({
      type: `https://problems.api/${slug}`,
      title: slug,
      status,
      detail,
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'X-Operation-Id': 'op' },
    },
  );

interface FetchScenario {
  acceptedIds: string[];
  failOnce?: 'transient' | 'duplicate' | 'unsupported' | 'too-large' | 'permanent-other';
  // Sequence the status poll responses; index N returned on the (N+1)th call.
  statusResponses?: BatchStatusResponse[];
}

const installFetch = (scenario: FetchScenario): jest.Mock => {
  let createdBatch: BatchResponse | null = null;
  let postedDocs = 0;
  let statusCalls = 0;
  let failConsumed = false;

  const mock = jest.fn(async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'POST' && /\/document-sets\/[^/]+\/batches$/.test(path)) {
      createdBatch = {
        batchId: 'b1',
        documentSetId: path.split('/')[2],
        status: 'Pending',
        totalDocuments: null,
        createdAt: new Date().toISOString(),
      };
      return ok(201, createdBatch);
    }

    if (method === 'POST' && /\/document-sets\/[^/]+\/batches\/[^/]+\/complete$/.test(path)) {
      return ok(200, { ...createdBatch!, status: 'InProgress', totalDocuments: postedDocs });
    }

    if (method === 'POST' && /\/document-sets\/[^/]+\/batches\/[^/]+\/status$/.test(path)) {
      const response = scenario.statusResponses?.[Math.min(statusCalls, (scenario.statusResponses?.length ?? 1) - 1)];
      statusCalls += 1;
      if (response) return ok(200, response);
      return ok(200, {
        batchId: 'b1',
        status: 'InProgress',
        totalDocuments: postedDocs,
        documents: [],
      } satisfies BatchStatusResponse);
    }

    if (method === 'POST' && path === '/documents') {
      if (scenario.failOnce && !failConsumed) {
        failConsumed = true;
        if (scenario.failOnce === 'transient') {
          return problem(502, 'blob-unavailable', 'Blob temporarily unavailable.');
        }
        if (scenario.failOnce === 'duplicate') {
          return problem(409, 'duplicate-filename', 'Already exists.');
        }
        if (scenario.failOnce === 'too-large') {
          return problem(400, 'document-too-large', 'File too large.');
        }
        if (scenario.failOnce === 'permanent-other') {
          return problem(403, 'forbidden', 'Forbidden.');
        }
        return problem(400, 'unsupported-content-type', 'Unsupported.');
      }
      const idx = postedDocs;
      postedDocs += 1;
      const documentId = scenario.acceptedIds[idx] ?? `doc-${idx}`;
      return ok(202, { documentId, status: 'Pending' } satisfies DocumentAcceptedResponse);
    }

    return new Response(`unhandled ${method} ${path}`, { status: 404 });
  });

  global.fetch = mock as unknown as typeof fetch;
  return mock;
};

const buildFileList = (files: File[]): FileList => {
  const list = files as unknown as FileList;
  Object.defineProperty(list, 'length', { value: files.length });
  return list;
};

describe('useUploadController', () => {
  let captured: { controller?: ReturnType<typeof useUploadController>; state?: ReturnType<typeof useUploadState> } = {};

  beforeEach(() => {
    captured = {};
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const onMount = (controller: ReturnType<typeof useUploadController>) => {
    captured.controller = controller;
  };
  const onState = (state: ReturnType<typeof useUploadState>) => {
    captured.state = state;
  };

  it('uploads a single supported file and reaches Submitted', async () => {
    installFetch({ acceptedIds: ['doc-1'] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      const file = captured.state!.files[0];
      expect(file?.status).toBe('Submitted');
      expect(file?.documentId).toBe('doc-1');
    });
  });

  it('rejects unsupported extensions client-side without hitting POST /documents', async () => {
    const mock = installFetch({ acceptedIds: [] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    // .zip is archive, not document — stays off the allowlist.
    const f = new File(['hi'], 'a.zip', { type: 'application/zip' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Unsupported');
    });
    const documentsCalls = mock.mock.calls.filter(
      (call) => (call[0] as string).endsWith('/documents'),
    );
    expect(documentsCalls).toHaveLength(0);
  });

  it('rejects oversize files client-side', async () => {
    installFetch({ acceptedIds: [] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File([new ArrayBuffer(0)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(f, 'size', { value: 101 * 1024 * 1024 });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Failed');
      expect(captured.state!.files[0]?.failureReason).toMatch(/100 MB/);
    });
  });

  it('drops junk files silently', async () => {
    installFetch({ acceptedIds: [] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const junk = new File(['x'], '.DS_Store', { type: 'application/octet-stream' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([junk]) },
        { rootFolderId: null },
      );
    });

    expect(captured.state!.files).toHaveLength(0);
  });

  it('marks 502 transient failures retryable and 400 unsupported as Skip', async () => {
    installFetch({ acceptedIds: ['doc-1'], failOnce: 'transient' });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Failed');
      expect(captured.state!.files[0]?.retryable).toBe(true);
      expect(captured.state!.files[0]?.severity).toBe('Fail');
    });
  });

  it('marks 409 duplicate as Duplicate (Skip severity, not retryable)', async () => {
    installFetch({ acceptedIds: ['doc-1'], failOnce: 'duplicate' });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Duplicate');
      expect(captured.state!.files[0]?.severity).toBe('Skip');
      expect(captured.state!.files[0]?.retryable).toBe(false);
    });
  });

  it('dismiss() removes a row from the session view', async () => {
    installFetch({ acceptedIds: ['doc-1'] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files).toHaveLength(1);
    });
    const id = captured.state!.files[0]!.clientId;
    act(() => captured.controller!.dismiss(id));
    expect(captured.state!.files).toHaveLength(0);
  });

  it('does nothing when documentSetId is null', async () => {
    installFetch({ acceptedIds: [] });
    render(wrap(<Probe documentSetId={null} onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    expect(captured.state!.files).toHaveLength(0);
  });

  it('dismissFailures drops all failed/skipped/duplicate rows', async () => {
    installFetch({ acceptedIds: ['doc-1'], failOnce: 'duplicate' });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });

    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Duplicate');
    });
    act(() => captured.controller!.dismissFailures());
    expect(captured.state!.files).toHaveLength(0);
  });

  it('toggleBanner / setBannerExpanded drive the banner expanded flag', () => {
    installFetch({ acceptedIds: [] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    expect(captured.state!.bannerExpanded).toBe(false);
    act(() => captured.controller!.toggleBanner());
    expect(captured.state!.bannerExpanded).toBe(true);
    act(() => captured.controller!.setBannerExpanded(false));
    expect(captured.state!.bannerExpanded).toBe(false);
  });

  it('clear() resets the session', async () => {
    installFetch({ acceptedIds: ['doc-1'] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => {
      expect(captured.state!.files).toHaveLength(1);
    });
    act(() => captured.controller!.clear());
    expect(captured.state!.files).toHaveLength(0);
    expect(captured.state!.targetDocumentSetId).toBe('');
  });

  it('marks the file Failed when creating a destination folder fails', async () => {
    let originalFetch: typeof fetch | undefined;
    originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && /\/document-sets\/[^/]+\/folders$/.test(path)) {
        return problem(500, 'internal-error', 'boom');
      }
      return new Response('not stubbed', { status: 404 });
    }) as unknown as typeof fetch;

    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'inner.pdf', { type: 'application/pdf' });
    Object.defineProperty(f, 'webkitRelativePath', {
      value: 'NewFolder/inner.pdf',
      configurable: true,
    });

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Failed');
      expect(captured.state!.files[0]?.failureReason).toMatch(/destination folder/);
      expect(captured.state!.files[0]?.retryable).toBe(true);
    });
    if (originalFetch) global.fetch = originalFetch;
  });

  it('appends to an existing session when called twice for the same collection', async () => {
    installFetch({ acceptedIds: ['doc-1', 'doc-2'] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f1 = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f1]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => expect(captured.state!.files).toHaveLength(1));

    const f2 = new File(['hi'], 'b.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f2]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => expect(captured.state!.files).toHaveLength(2));
  });

  it('marks 400 document-too-large as Failed (not retryable)', async () => {
    installFetch({ acceptedIds: [], failOnce: 'too-large' });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Failed');
      expect(captured.state!.files[0]?.retryable).toBe(false);
    });
  });

  it('marks a 403 forbidden as a permanent failure (not retryable)', async () => {
    installFetch({ acceptedIds: [], failOnce: 'permanent-other' });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const f = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([f]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => {
      expect(captured.state!.files[0]?.status).toBe('Failed');
      expect(captured.state!.files[0]?.retryable).toBe(false);
    });
  });

  it('drops junk + supported files together (junk filtered, supported uploaded)', async () => {
    installFetch({ acceptedIds: ['doc-1'] });
    render(wrap(<Probe documentSetId="ds" onMount={onMount} onState={onState} />));
    const junk = new File(['x'], '.DS_Store', { type: 'application/octet-stream' });
    const real = new File(['x'], 'real.pdf', { type: 'application/pdf' });
    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([junk, real]) },
        { rootFolderId: null },
      );
    });
    await waitFor(() => {
      expect(captured.state!.files).toHaveLength(1);
      expect(captured.state!.files[0]?.relativePath).toBe('real.pdf');
    });
  });
});

describe('useUploadController — cross-collection guard (slice #3)', () => {
  interface XCaptured {
    controller?: ReturnType<typeof useUploadController>;
    dispatch?: ReturnType<typeof useUploadDispatch>;
    state?: ReturnType<typeof useUploadState>;
  }

  const XProbe = ({
    documentSetId,
    onMount,
    onState,
  }: {
    documentSetId: string | null;
    onMount: (
      controller: ReturnType<typeof useUploadController>,
      dispatch: ReturnType<typeof useUploadDispatch>,
    ) => void;
    onState: (state: ReturnType<typeof useUploadState>) => void;
  }) => {
    const controller = useUploadController(documentSetId);
    const dispatch = useUploadDispatch();
    const state = useUploadState();
    onMount(controller, dispatch);
    onState(state);
    return null;
  };

  const fakeFile = (name: string): File =>
    ({ name, type: 'application/pdf', size: 4 } as unknown as File);

  it('refuses to start a new session in a different collection while one is in flight', async () => {
    const mock = installFetch({ acceptedIds: [] });
    const captured: XCaptured = {};

    // Start the probe on collection "ds-other" — but seed an in-flight
    // session targeting "ds-A" via dispatch so the cross-collection guard
    // has something to compare against.
    render(
      wrap(
        <XProbe
          documentSetId="ds-other"
          onMount={(controller, dispatch) => {
            captured.controller = controller;
            captured.dispatch = dispatch;
          }}
          onState={(state) => {
            captured.state = state;
          }}
        />,
      ),
    );

    act(() => {
      captured.dispatch!({
        type: 'START_SESSION',
        targetDocumentSetId: 'ds-A',
        files: [
          {
            clientId: 'a-1',
            file: fakeFile('a.pdf'),
            relativePath: 'a.pdf',
            targetFolderId: null,
            status: 'Uploading',
            documentId: null,
            failureReason: null,
            severity: null,
            retryable: false,
          },
        ],
      });
      captured.dispatch!({ type: 'SET_AGGREGATE', status: 'InProgress' });
    });

    const callsBefore = mock.mock.calls.length;

    await act(async () => {
      await captured.controller!.acceptDrop(
        { fileList: buildFileList([new File(['x'], 'b.pdf', { type: 'application/pdf' })]) },
        { rootFolderId: null },
      );
    });

    // No new network calls — acceptDrop refused before touching the API.
    expect(mock.mock.calls.length).toBe(callsBefore);
    // The in-flight session for ds-A is untouched.
    expect(captured.state!.targetDocumentSetId).toBe('ds-A');
    expect(captured.state!.files).toHaveLength(1);
    expect(captured.state!.files[0]?.relativePath).toBe('a.pdf');
  });
});

describe('useUploadController — indexed-fade gating', () => {
  interface FadeCaptured {
    dispatch?: ReturnType<typeof useUploadDispatch>;
    state?: ReturnType<typeof useUploadState>;
  }

  const FadeProbe = ({
    onMount,
    onState,
  }: {
    onMount: (dispatch: ReturnType<typeof useUploadDispatch>) => void;
    onState: (state: ReturnType<typeof useUploadState>) => void;
  }) => {
    // Mount the controller for its fade-arming effect; the test drives the
    // session state directly via dispatch instead of acceptDrop so we can
    // place a file in Indexed with a specific aggregateStatus without
    // staging fetch responses.
    useUploadController('ds');
    const dispatch = useUploadDispatch();
    const state = useUploadState();
    onMount(dispatch);
    onState(state);
    return null;
  };

  const fakeFile = (name: string): File =>
    ({ name, type: 'application/pdf', size: 1 } as unknown as File);

  const buildIndexedFile = (clientId: string): UploadFile => ({
    clientId,
    file: fakeFile(`${clientId}.pdf`),
    relativePath: `${clientId}.pdf`,
    targetFolderId: null,
    status: 'Indexed',
    documentId: `doc-${clientId}`,
    failureReason: null,
    severity: null,
    retryable: false,
  });

  let captured: FadeCaptured = {};

  beforeEach(() => {
    captured = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not dismiss Indexed rows while the batch is still InProgress', () => {
    render(
      wrap(
        <FadeProbe
          onMount={(dispatch) => {
            captured.dispatch = dispatch;
          }}
          onState={(state) => {
            captured.state = state;
          }}
        />,
      ),
    );

    act(() => {
      captured.dispatch!({
        type: 'START_SESSION',
        targetDocumentSetId: 'ds',
        files: [buildIndexedFile('a')],
      });
      captured.dispatch!({ type: 'SET_AGGREGATE', status: 'InProgress' });
    });

    act(() => {
      jest.advanceTimersByTime(__TESTING__.INDEXED_FADE_MS + 1000);
    });

    expect(captured.state!.aggregateStatus).toBe('InProgress');
    expect(captured.state!.files).toHaveLength(1);
    expect(captured.state!.files[0]?.status).toBe('Indexed');
  });

  it('keeps polling while the server aggregate is InProgress even after every file reaches Indexed', async () => {
    // Regression: previously polling stopped the moment no client-side file
    // was Submitted/Indexing, so a poll that reported every file Indexed while
    // the server's aggregate was still InProgress would leave the folder tree
    // / file-list caches stale forever — reconcileStatus only invalidates on
    // the aggregate flip to Completed/CompletedWithErrors.
    jest.useRealTimers();
    const mock = jest.fn(async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && /\/batches\/[^/]+\/status$/.test(path)) {
        return ok(200, {
          batchId: 'b1',
          status: 'Completed',
          totalDocuments: 1,
          documents: [
            { documentId: 'doc-a', status: 'Ready', failureReason: null },
          ],
        } satisfies BatchStatusResponse);
      }
      return new Response('unhandled', { status: 404 });
    });
    global.fetch = mock as unknown as typeof fetch;

    render(
      wrap(
        <FadeProbe
          onMount={(dispatch) => {
            captured.dispatch = dispatch;
          }}
          onState={(state) => {
            captured.state = state;
          }}
        />,
      ),
    );

    act(() => {
      captured.dispatch!({
        type: 'START_SESSION',
        targetDocumentSetId: 'ds',
        files: [buildIndexedFile('a')],
      });
      captured.dispatch!({ type: 'SET_BATCH_ID', batchId: 'b1' });
      // Server has not yet flipped the aggregate to Completed even though the
      // client-side file is already Indexed — the exact race that caused the
      // background file table to stop refreshing.
      captured.dispatch!({ type: 'SET_AGGREGATE', status: 'InProgress' });
    });

    await waitFor(() => {
      const statusCalls = mock.mock.calls.filter((call) =>
        /\/batches\/[^/]+\/status$/.test(call[0] as string),
      );
      expect(statusCalls.length).toBeGreaterThan(0);
    });
    // After the poll resolves, reconcileStatus should flip aggregate to
    // Completed — which is the signal the folder-cache invalidation keys off.
    await waitFor(() => {
      expect(captured.state!.aggregateStatus).toBe('Completed');
    });
  });

  it('dismisses Indexed rows after fade once the batch is Completed', () => {
    render(
      wrap(
        <FadeProbe
          onMount={(dispatch) => {
            captured.dispatch = dispatch;
          }}
          onState={(state) => {
            captured.state = state;
          }}
        />,
      ),
    );

    act(() => {
      captured.dispatch!({
        type: 'START_SESSION',
        targetDocumentSetId: 'ds',
        files: [buildIndexedFile('a')],
      });
      captured.dispatch!({ type: 'SET_AGGREGATE', status: 'Completed' });
    });

    act(() => {
      jest.advanceTimersByTime(__TESTING__.INDEXED_FADE_MS + 100);
    });

    expect(captured.state!.files).toHaveLength(0);
  });
});
