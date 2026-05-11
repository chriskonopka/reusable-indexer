import { act, render, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentSetSummary, IndexerEvent, Paged } from '@shared/types';

import { queryKeys } from '../api/queryKeys';
import {
  ActiveDocumentSetProvider,
  useActiveDocumentSet,
} from '../features/collections/state';
import { SelectionProvider, useSelection } from '../features/selection';
import { HostProvider } from '../host/HostContext';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ToastProvider } from '../hooks/useToast';
import { __resetIndexerDbForTests } from '../utils/idb';

import { SelectionEventBridge } from './SelectionEventBridge';

// Tight integration test for the bridge. We seed the QueryClient with a
// doc-set list (so `select()` can resolve an access role) and expose the
// active-document-set + selection APIs through a probe.
//
// jest-axe is not used here: the Probe renders no DOM (returns null) and the
// bridge itself emits the IndexerEvent stream — there's nothing to audit.
// Accessibility for the visible selection UI lives in the FileList and
// FolderTree component tests.

interface Captured {
  select?: ReturnType<typeof useActiveDocumentSet>['select'];
  clearActive?: ReturnType<typeof useActiveDocumentSet>['clear'];
  selection?: ReturnType<typeof useSelection>;
}

const Probe = ({
  onMount,
}: {
  onMount: (captured: Required<Captured>) => void;
}) => {
  const active = useActiveDocumentSet();
  const selection = useSelection();
  onMount({ select: active.select, clearActive: active.clear, selection });
  return null;
};

const docSetSummary = (
  overrides: Partial<DocumentSetSummary> = {},
): DocumentSetSummary => ({
  documentSetId: 'ds-A',
  name: 'A',
  ownerUserId: 'u-1',
  accessRole: 'Owner',
  updatedAt: '2026-05-05T00:00:00Z',
  createdAt: '2026-05-05T00:00:00Z',
  documentCount: 0,
  folderCount: 0,
  pendingCount: 0,
  failedCount: 0,
  ...overrides,
});

const wrap = (children: ReactNode, events: IndexerEvent[]) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const summaries: Paged<DocumentSetSummary> = {
    items: [
      docSetSummary({ documentSetId: 'ds-A', name: 'A' }),
      docSetSummary({ documentSetId: 'ds-B', name: 'B' }),
    ],
    totalCount: 2,
    page: 1,
    pageSize: 100,
  };
  queryClient.setQueryData(queryKeys.documentSets.list(), summaries);
  return (
    <HostProvider
      value={{
        apiBaseUrl: 'https://test.invalid',
        getAccessToken: async () => 'tok',
        onEvent: (event) => events.push(event),
      }}
    >
      <ThemeProvider initialTheme="light">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ActiveDocumentSetProvider>
              <SelectionProvider>
                <SelectionEventBridge />
                {children}
              </SelectionProvider>
            </ActiveDocumentSetProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};

describe('SelectionEventBridge', () => {
  let captured: Captured = {};
  let events: IndexerEvent[] = [];

  beforeEach(() => {
    captured = {};
    events = [];
    __resetIndexerDbForTests();
  });

  const onMount = (api: Required<Captured>) => {
    captured = api;
  };

  it('emits selection/changed when the user adds a document to the selection', async () => {
    render(wrap(<Probe onMount={onMount} />, events));

    // Activate a collection first — bridge clears + emits empty arrays.
    act(() => {
      captured.select!('ds-A');
    });
    // Flush the post-clear render.
    await act(async () => {
      await Promise.resolve();
    });

    events.length = 0; // ignore activation-time noise
    act(() => {
      captured.selection!.toggleDocument({
        documentId: 'd-1',
        fileName: 'a.pdf',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const selectionEvents = events.filter((e) => e.type === 'selection/changed');
    expect(selectionEvents.length).toBeGreaterThan(0);
    const last = selectionEvents[selectionEvents.length - 1];
    expect(last).toEqual({
      type: 'selection/changed',
      documentSetId: 'ds-A',
      documents: [{ documentId: 'd-1', fileName: 'a.pdf' }],
      folders: [],
    });
  });

  it('emits selection/changed with empty arrays when the collection switches', async () => {
    render(wrap(<Probe onMount={onMount} />, events));

    // Activate A, add a doc.
    await act(async () => {
      captured.select!('ds-A');
    });
    await act(async () => {
      captured.selection!.toggleDocument({ documentId: 'd-1', fileName: 'a.pdf' });
    });

    events.length = 0;

    // Switch to B. Bridge should clear + emit empty arrays under ds-B.
    // Pass the fallback access role so the cache lookup races don't NO-OP
    // the second activation in this test environment.
    await act(async () => {
      captured.select!('ds-B', 'Owner');
    });

    await waitFor(() => {
      const recent = events.filter((e) => e.type === 'selection/changed');
      expect(recent.length).toBeGreaterThan(0);
    });

    const selectionEvents = events.filter((e) => e.type === 'selection/changed');
    const last = selectionEvents[selectionEvents.length - 1];
    expect(last).toEqual({
      type: 'selection/changed',
      documentSetId: 'ds-B',
      documents: [],
      folders: [],
    });
    // The consumer must never see a payload where documentSetId is the new id
    // but the docs/folders still belong to the old collection.
    for (const event of selectionEvents) {
      if (event.type === 'selection/changed' && event.documentSetId === 'ds-B') {
        expect(event.documents).toEqual([]);
        expect(event.folders).toEqual([]);
      }
    }
  });

  it('emits selection/changed when a folder is added to the selection', async () => {
    render(wrap(<Probe onMount={onMount} />, events));

    act(() => {
      captured.select!('ds-A');
    });
    await act(async () => Promise.resolve());
    events.length = 0;

    act(() => {
      captured.selection!.toggleFolder({
        folderId: 'f-1',
        folderName: 'Contracts',
        path: 'Contracts',
      });
    });
    await act(async () => Promise.resolve());

    const last = events.filter((e) => e.type === 'selection/changed').at(-1);
    expect(last).toEqual({
      type: 'selection/changed',
      documentSetId: 'ds-A',
      documents: [],
      folders: [{ folderId: 'f-1', folderName: 'Contracts', path: 'Contracts' }],
    });
  });

  it('emits empty arrays after a manual clear()', async () => {
    render(wrap(<Probe onMount={onMount} />, events));

    act(() => {
      captured.select!('ds-A');
    });
    await act(async () => Promise.resolve());
    act(() => {
      captured.selection!.toggleDocument({ documentId: 'd-1', fileName: 'a.pdf' });
      captured.selection!.toggleFolder({
        folderId: 'f-1',
        folderName: 'Contracts',
        path: 'Contracts',
      });
    });
    await act(async () => Promise.resolve());
    events.length = 0;

    act(() => {
      captured.selection!.clear();
    });
    await act(async () => Promise.resolve());

    const last = events.filter((e) => e.type === 'selection/changed').at(-1);
    expect(last).toEqual({
      type: 'selection/changed',
      documentSetId: 'ds-A',
      documents: [],
      folders: [],
    });
  });
});
