import { ReactNode } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { IndexerEvent, Paged, DocumentSetSummary } from '@shared/types';
import { __resetIndexerDbForTests } from '../../utils/idb';
import { ActiveDocumentSetProvider, useActiveDocumentSet } from './state';
import { Harness } from './test-utils';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';

const seedListInCache = (
  client: ReturnType<typeof useQueryClient>,
  rows: DocumentSetSummary[],
) => {
  const data: Paged<DocumentSetSummary> = {
    items: rows,
    totalCount: rows.length,
    page: 1,
    pageSize: 100,
  };
  client.setQueryData(queryKeys.documentSets.list(), data);
};

const collection = (id: string, accessRole: 'Owner' | 'Shared' = 'Owner'): DocumentSetSummary => ({
  documentSetId: id,
  name: `Set ${id}`,
  accessRole,
  updatedAt: '2026-05-04T12:00:00Z',
});

const wrap = (events: IndexerEvent[] = []) => {
  const Wrapped = ({ children }: { children: ReactNode }) => (
    <Harness host={{ onEvent: (event) => events.push(event) }}>
      {children}
    </Harness>
  );
  Wrapped.displayName = 'StateTestWrapper';
  return Wrapped;
};

describe('ActiveDocumentSetProvider', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
  });

  it('emits collection/activated with null on first mount', async () => {
    const events: IndexerEvent[] = [];
    renderHook(() => useActiveDocumentSet(), { wrapper: wrap(events) });

    await waitFor(() => {
      expect(events).toContainEqual({
        type: 'collection/activated',
        documentSetId: null,
        accessRole: null,
      });
    });
  });

  it('selects a documentSet by id and emits collection/activated', async () => {
    const events: IndexerEvent[] = [];
    const { result } = renderHook(
      () => ({
        active: useActiveDocumentSet(),
        client: useQueryClient(),
      }),
      { wrapper: wrap(events) },
    );

    act(() => {
      seedListInCache(result.current.client, [collection('abc')]);
    });
    act(() => {
      result.current.active.select('abc');
    });

    await waitFor(() => {
      expect(result.current.active.documentSetId).toBe('abc');
      expect(result.current.active.accessRole).toBe('Owner');
    });

    await waitFor(() => {
      expect(events).toContainEqual({
        type: 'collection/activated',
        documentSetId: 'abc',
        accessRole: 'Owner',
      });
    });
  });

  it('is a no-op when select targets a documentSet not in the cache', async () => {
    const { result } = renderHook(
      () => ({
        active: useActiveDocumentSet(),
        client: useQueryClient(),
      }),
      { wrapper: wrap() },
    );
    act(() => {
      seedListInCache(result.current.client, [collection('abc')]);
    });
    act(() => {
      result.current.active.select('not-in-cache');
    });
    expect(result.current.active.documentSetId).toBeNull();
  });

  it('clear() resets to null and emits collection/activated', async () => {
    const events: IndexerEvent[] = [];
    const { result } = renderHook(
      () => ({
        active: useActiveDocumentSet(),
        client: useQueryClient(),
      }),
      { wrapper: wrap(events) },
    );
    act(() => {
      seedListInCache(result.current.client, [collection('abc')]);
    });
    act(() => {
      result.current.active.select('abc');
    });
    await waitFor(() => {
      expect(result.current.active.documentSetId).toBe('abc');
    });

    act(() => {
      result.current.active.clear();
    });
    expect(result.current.active.documentSetId).toBeNull();
    expect(result.current.active.accessRole).toBeNull();

    await waitFor(() => {
      expect(events.filter((e) => e.type === 'collection/activated').slice(-1)[0]).toEqual({
        type: 'collection/activated',
        documentSetId: null,
        accessRole: null,
      });
    });
  });

  it('reflects the Shared accessRole when selecting a shared collection', async () => {
    const { result } = renderHook(
      () => ({
        active: useActiveDocumentSet(),
        client: useQueryClient(),
      }),
      { wrapper: wrap() },
    );
    act(() => {
      seedListInCache(result.current.client, [collection('shared-1', 'Shared')]);
    });
    act(() => {
      result.current.active.select('shared-1');
    });
    await waitFor(() => {
      expect(result.current.active.accessRole).toBe('Shared');
    });
  });

  it('throws when useActiveDocumentSet is called outside the provider', () => {
    const Outside = () => {
      useActiveDocumentSet();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Outside />)).toThrow(/inside <ActiveDocumentSetProvider>/);
    consoleError.mockRestore();
  });

  it('renders children passed to the provider', () => {
    const { container } = render(
      <ActiveDocumentSetProvider>
        <span data-testid="child">child</span>
      </ActiveDocumentSetProvider>,
      { wrapper: wrap() },
    );
    expect(container.querySelector('[data-testid="child"]')).toBeInTheDocument();
  });
});
