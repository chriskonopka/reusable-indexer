import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { DocumentSetSummary, IndexerAppProps, IndexerEvent, Paged } from '@shared/types';
import { __resetIndexerDbForTests } from '../../utils/idb';
import { CollectionsSidebar } from './CollectionsSidebar';
import { Harness } from './test-utils';

const collectionRow = (overrides: Partial<DocumentSetSummary> = {}): DocumentSetSummary => ({
  documentSetId: 'ds-1',
  name: 'Acme matter',
  accessRole: 'Owner',
  updatedAt: '2026-05-04T12:00:00Z',
  ...overrides,
});

const buildResponse = (status: number, body: unknown): Response => {
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  };
  return new Response(body === undefined ? null : JSON.stringify(body), init);
};

interface FetchHandlers {
  list: jest.Mock<Promise<Response>, [URL | RequestInfo, RequestInit | undefined]>;
  create: jest.Mock<Promise<Response>, [URL | RequestInfo, RequestInit | undefined]>;
  rename: jest.Mock<Promise<Response>, [URL | RequestInfo, RequestInit | undefined]>;
  remove: jest.Mock<Promise<Response>, [URL | RequestInfo, RequestInit | undefined]>;
}

const installFetch = (
  initial: Paged<DocumentSetSummary>,
): FetchHandlers => {
  let current: Paged<DocumentSetSummary> = initial;

  const list = jest.fn(async () => buildResponse(200, current));
  const create = jest.fn(async (_url: URL | RequestInfo, init: RequestInit | undefined) => {
    const body = JSON.parse(init?.body as string) as { name: string };
    const created: DocumentSetSummary = {
      documentSetId: `ds-${current.items.length + 1}`,
      name: body.name,
      accessRole: 'Owner',
      updatedAt: new Date().toISOString(),
    };
    current = {
      ...current,
      items: [created, ...current.items],
      totalCount: current.totalCount + 1,
    };
    return buildResponse(201, {
      ...created,
      ownerUserId: 'me',
      createdAt: created.updatedAt,
    });
  });
  const rename = jest.fn(async (url: URL | RequestInfo, init: RequestInit | undefined) => {
    const body = JSON.parse(init?.body as string) as { name: string };
    const id = String(url).split('/').pop()!;
    current = {
      ...current,
      items: current.items.map((row) =>
        row.documentSetId === id ? { ...row, name: body.name } : row,
      ),
    };
    return buildResponse(200, {
      ...current.items.find((row) => row.documentSetId === id)!,
      ownerUserId: 'me',
      createdAt: '2026-05-04T12:00:00Z',
    });
  });
  const remove = jest.fn(async (url: URL | RequestInfo) => {
    const id = String(url).split('/').pop()!;
    current = {
      ...current,
      items: current.items.filter((row) => row.documentSetId !== id),
      totalCount: Math.max(0, current.totalCount - 1),
    };
    return buildResponse(204, undefined);
  });

  global.fetch = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/document-sets/list') && method === 'POST') return list(input, init);
    if (url.endsWith('/document-sets') && method === 'POST') return create(input, init);
    if (url.includes('/document-sets/') && method === 'PATCH') return rename(input, init);
    if (url.includes('/document-sets/') && method === 'DELETE') return remove(input, init);
    if (url.endsWith('/shares/list') && method === 'POST') {
      return buildResponse(200, { items: [], totalCount: 0, page: 1, pageSize: 100 });
    }
    return buildResponse(404, { type: 'about:blank', title: 'not found', status: 404 });
  }) as unknown as typeof fetch;

  return { list, create, rename, remove };
};

describe('CollectionsSidebar', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderSidebar = (
    handlersOpts: { initial?: Paged<DocumentSetSummary>; activeId?: string } = {},
    hostOverrides: Partial<IndexerAppProps> = {},
    sidebarProps: {
      uploadInProgress?: boolean;
      onAfterCollectionSelect?: () => void;
    } = {},
  ) => {
    const initial: Paged<DocumentSetSummary> =
      handlersOpts.initial ?? {
        items: [collectionRow(), collectionRow({ documentSetId: 'ds-2', name: 'Beta', updatedAt: '2026-05-03T10:00:00Z' })],
        totalCount: 2,
        page: 1,
        pageSize: 100,
      };
    const handlers = installFetch(initial);
    const utils = render(
      <Harness host={hostOverrides} initialActiveId={handlersOpts.activeId}>
        <CollectionsSidebar
          collapsed={false}
          onToggleCollapse={() => {}}
          uploadInProgress={sidebarProps.uploadInProgress}
          onAfterCollectionSelect={sidebarProps.onAfterCollectionSelect}
        />
      </Harness>,
    );
    return { ...utils, handlers };
  };

  it('renders an empty state when the user has no collections', async () => {
    renderSidebar({
      initial: { items: [], totalCount: 0, page: 1, pageSize: 100 },
    });
    expect(
      await screen.findByText("Click 'New collection' to get started."),
    ).toBeInTheDocument();
  });

  it('renders the user collections sorted by updatedAt desc', async () => {
    renderSidebar();
    await screen.findByRole('button', { name: 'Acme matter' });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Acme matter');
    expect(items[1]).toHaveTextContent('Beta');
  });

  it('emits collection/activated when the user selects a row', async () => {
    const events: IndexerEvent[] = [];
    const user = userEvent.setup();
    renderSidebar({}, { onEvent: (e) => events.push(e) });

    const row = await screen.findByRole('button', { name: 'Acme matter' });
    await user.click(row);

    await waitFor(() => {
      expect(events).toContainEqual({
        type: 'collection/activated',
        documentSetId: 'ds-1',
        accessRole: 'Owner',
      });
    });
  });

  it('creates a new collection and emits collection/list-changed', async () => {
    const events: IndexerEvent[] = [];
    const user = userEvent.setup();
    const { handlers } = renderSidebar({}, { onEvent: (e) => events.push(e) });

    await screen.findByRole('button', { name: 'Acme matter' });
    await user.click(screen.getByRole('button', { name: 'New collection' }));

    await waitFor(() => {
      expect(handlers.create).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(events).toContainEqual({ type: 'collection/list-changed' });
    });
  });

  it('shows a Shared badge for read-only collections', async () => {
    renderSidebar({
      initial: {
        items: [
          collectionRow({ documentSetId: 'ds-x', name: 'Theirs', accessRole: 'Shared' }),
        ],
        totalCount: 1,
        page: 1,
        pageSize: 100,
      },
    });
    expect(await screen.findByText('Shared')).toBeInTheDocument();
  });

  it('does not render mutation affordances on a shared collection', async () => {
    renderSidebar({
      initial: {
        items: [
          collectionRow({ documentSetId: 'ds-x', name: 'Theirs', accessRole: 'Shared' }),
        ],
        totalCount: 1,
        page: 1,
        pageSize: 100,
      },
    });

    await screen.findByRole('button', { name: 'Theirs' });
    expect(screen.queryByRole('button', { name: /Rename Theirs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Theirs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share Theirs/ })).not.toBeInTheDocument();
  });

  it('renders the row-name button with a native title tooltip for truncation', async () => {
    renderSidebar();
    const button = await screen.findByRole('button', { name: 'Acme matter' });
    expect(button).toHaveAttribute('title', 'Acme matter');
  });

  it('calls onAfterCollectionSelect after a row click resolves to a select', async () => {
    const user = userEvent.setup();
    const onAfter = jest.fn();
    renderSidebar({}, {}, { onAfterCollectionSelect: onAfter });
    await user.click(await screen.findByRole('button', { name: 'Acme matter' }));
    expect(onAfter).toHaveBeenCalledTimes(1);
  });

  it('does not call onAfterCollectionSelect when the click is blocked by the upload guard', async () => {
    const user = userEvent.setup();
    const onAfter = jest.fn();
    renderSidebar(
      {
        initial: {
          items: [
            collectionRow({ documentSetId: 'ds-active' }),
            collectionRow({ documentSetId: 'ds-other', name: 'Other' }),
          ],
          totalCount: 2,
          page: 1,
          pageSize: 100,
        },
        activeId: 'ds-active',
      },
      {},
      { uploadInProgress: true, onAfterCollectionSelect: onAfter },
    );
    await user.click(await screen.findByRole('button', { name: 'Other' }));
    expect(onAfter).not.toHaveBeenCalled();
  });

  it('toggles the collapse state via the host-supplied callback', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    installFetch({ items: [], totalCount: 0, page: 1, pageSize: 100 });
    render(
      <Harness>
        <CollectionsSidebar collapsed={false} onToggleCollapse={onToggle} />
      </Harness>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Collapse collections sidebar' }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renames a collection inline on click of the rename action', async () => {
    const user = userEvent.setup();
    const { handlers } = renderSidebar();

    await screen.findByRole('button', { name: 'Acme matter' });
    await user.click(screen.getByRole('button', { name: 'Rename Acme matter' }));

    const input = await screen.findByRole('textbox', { name: 'Rename Acme matter' });
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');

    await waitFor(() => {
      expect(handlers.rename).toHaveBeenCalled();
    });
  });

  it('opens the delete dialog and deletes on confirm', async () => {
    const user = userEvent.setup();
    const { handlers } = renderSidebar();

    await screen.findByRole('button', { name: 'Acme matter' });
    await user.click(screen.getByRole('button', { name: 'Delete Acme matter' }));

    expect(await screen.findByRole('dialog', { name: /Delete Acme matter/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(handlers.remove).toHaveBeenCalled();
    });
  });

  it('blocks switching while uploadInProgress and surfaces a toast', async () => {
    const user = userEvent.setup();
    installFetch({
      items: [
        collectionRow({ documentSetId: 'ds-1', name: 'A' }),
        collectionRow({ documentSetId: 'ds-2', name: 'B', updatedAt: '2026-05-03T00:00:00Z' }),
      ],
      totalCount: 2,
      page: 1,
      pageSize: 100,
    });

    const { rerender } = render(
      <Harness>
        <CollectionsSidebar
          collapsed={false}
          onToggleCollapse={() => {}}
          uploadInProgress={false}
        />
      </Harness>,
    );

    // First, activate row A in a no-upload state so it becomes the active row.
    const rowA = await screen.findByRole('button', { name: 'A' });
    await user.click(rowA);
    await waitFor(() => {
      expect(rowA.closest('li')).toHaveAttribute('aria-current', 'true');
    });

    // Now flip uploadInProgress=true and try to switch — the guard fires.
    rerender(
      <Harness>
        <CollectionsSidebar
          collapsed={false}
          onToggleCollapse={() => {}}
          uploadInProgress
        />
      </Harness>,
    );

    const rowB = await screen.findByRole('button', { name: 'B' });
    await user.click(rowB);

    expect(await screen.findByText(/Upload in progress/)).toBeInTheDocument();
  });

  it('has no axe violations in the loaded state', async () => {
    const { container } = renderSidebar();
    await screen.findByRole('button', { name: 'Acme matter' });
    // Wait for any async hydration.
    await act(async () => {
      await Promise.resolve();
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = renderSidebar({
      initial: { items: [], totalCount: 0, page: 1, pageSize: 100 },
    });
    await screen.findByText("Click 'New collection' to get started.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a load-error message when the list query fails', async () => {
    const problem = {
      type: 'https://problems.api/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'You cannot list collections.',
    };
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(problem), {
        status: 403,
        headers: { 'content-type': 'application/problem+json' },
      }),
    ) as unknown as typeof fetch;

    render(
      <Harness>
        <CollectionsSidebar collapsed={false} onToggleCollapse={() => {}} />
      </Harness>,
    );

    expect(await screen.findByText('Could not load collections.')).toBeInTheDocument();
  });

  it('surfaces a toast when create fails', async () => {
    const user = userEvent.setup();
    let createCalled = false;
    global.fetch = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/document-sets/list') && method === 'POST') {
        return new Response(
          JSON.stringify({ items: [], totalCount: 0, page: 1, pageSize: 100 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/document-sets') && method === 'POST') {
        createCalled = true;
        return new Response(
          JSON.stringify({
            type: 'https://problems.api/conflict',
            title: 'Conflict',
            status: 409,
            detail: 'Name already in use.',
          }),
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    render(
      <Harness>
        <CollectionsSidebar collapsed={false} onToggleCollapse={() => {}} />
      </Harness>,
    );
    await screen.findByText("Click 'New collection' to get started.");
    await user.click(screen.getByRole('button', { name: 'New collection' }));

    expect(await screen.findByText('Name already in use.')).toBeInTheDocument();
    expect(createCalled).toBe(true);
  });

  it('renders the collapsed state without the New collection button', () => {
    installFetch({ items: [], totalCount: 0, page: 1, pageSize: 100 });
    render(
      <Harness>
        <CollectionsSidebar collapsed onToggleCollapse={() => {}} />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: 'New collection' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand collections sidebar' })).toBeInTheDocument();
  });

  it('selecting the already-active row is a no-op', async () => {
    const user = userEvent.setup();
    const events: IndexerEvent[] = [];
    renderSidebar({}, { onEvent: (e) => events.push(e) });

    const rowA = await screen.findByRole('button', { name: 'Acme matter' });
    await user.click(rowA);
    await waitFor(() => {
      expect(rowA.closest('li')).toHaveAttribute('aria-current', 'true');
    });

    const eventCountAfterFirst = events.filter(
      (e) => e.type === 'collection/activated' && (e as { documentSetId?: string | null }).documentSetId === 'ds-1',
    ).length;

    await user.click(rowA);

    const eventCountAfterSecond = events.filter(
      (e) => e.type === 'collection/activated' && (e as { documentSetId?: string | null }).documentSetId === 'ds-1',
    ).length;

    expect(eventCountAfterSecond).toBe(eventCountAfterFirst);
  });
});
