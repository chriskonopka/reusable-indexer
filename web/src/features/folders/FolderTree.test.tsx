import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FolderTreeResponse } from '@shared/types';
import { HostProvider } from '../../host/HostContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider } from '../../hooks/useToast';
import { ToastViewport } from '../../components/Toast';
import { __resetIndexerDbForTests } from '../../utils/idb';
import { SelectionProvider } from '../selection';
import { FolderTree } from './FolderTree';
import type { FolderTreeHandle, FolderTreeProps } from './FolderTree';

// ─── Test data ───────────────────────────────────────────────────────────────

const TREE_ONE_ROOT: FolderTreeResponse = {
  documentSetId: 'ds-1',
  roots: [
    {
      folderId: 'f-alpha',
      parentFolderId: null,
      name: 'Alpha',
      children: [
        { folderId: 'f-sub', parentFolderId: 'f-alpha', name: 'Sub Alpha', children: [] },
      ],
    },
    { folderId: 'f-beta', parentFolderId: null, name: 'Beta', children: [] },
  ],
};

const TREE_EMPTY: FolderTreeResponse = { documentSetId: 'ds-1', roots: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildOkResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  });

const buildFolderFetch =
  (tree: FolderTreeResponse) =>
  (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/folders') && method === 'GET') return Promise.resolve(buildOkResponse(tree));
    if (url.includes('/folders') && method === 'POST' && !url.includes('/move')) {
      const created = {
        folderId: 'f-new',
        parentFolderId: null,
        name: 'New Folder',
        documentSetId: 'ds-1',
        createdAt: '2026-05-05T00:00:00Z',
        updatedAt: '2026-05-05T00:00:00Z',
      };
      return Promise.resolve(buildOkResponse(created));
    }
    if (url.includes('/folders/') && method === 'PATCH') {
      return Promise.resolve(
        buildOkResponse({
          folderId: 'f-alpha',
          name: 'Renamed',
          parentFolderId: null,
          documentSetId: 'ds-1',
          createdAt: '2026-05-05T00:00:00Z',
          updatedAt: '2026-05-05T00:00:00Z',
        }),
      );
    }
    if (url.includes('/folders/') && url.includes('/move') && method === 'POST') {
      return Promise.resolve(
        buildOkResponse({
          folderId: 'f-beta',
          name: 'Beta',
          parentFolderId: 'f-alpha',
          documentSetId: 'ds-1',
          createdAt: '2026-05-05T00:00:00Z',
          updatedAt: '2026-05-05T00:00:00Z',
        }),
      );
    }
    if (url.includes('/folders/') && method === 'DELETE') {
      return Promise.resolve(
        new Response(JSON.stringify({ folderId: 'f-alpha', affectedDocumentIds: [] }), {
          status: 202,
          headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
        }),
      );
    }
    if (url.match(/\/documents\/[^/]+\/move$/) && method === 'POST') {
      return Promise.resolve(
        buildOkResponse({
          documentId: 'd-1',
          documentSetId: 'ds-1',
          folderId: 'f-alpha',
          fileName: 'foo.pdf',
          status: 'Ready',
          fileType: 'Other',
          contentType: 'application/pdf',
          fileSizeBytes: 1234,
          createdAt: '2026-05-05T00:00:00Z',
          updatedAt: '2026-05-05T00:00:00Z',
        }),
      );
    }

    return Promise.resolve(new Response(null, { status: 404 }));
  };

// ─── Harness ──────────────────────────────────────────────────────────────────

const buildQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

interface HarnessProps {
  children: ReactNode;
}

const Harness = ({ children }: HarnessProps) => {
  const queryClient = useMemo(buildQueryClient, []);
  return (
    <HostProvider
      value={{
        apiBaseUrl: 'https://test.invalid',
        getAccessToken: async () => 'tok',
        onEvent: () => {},
      }}
    >
      <ThemeProvider initialTheme="light">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <SelectionProvider>
              {children}
              <ToastViewport />
            </SelectionProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};

// Default rendering helper
const renderTree = (overrides: Partial<FolderTreeProps> = {}, tree = TREE_ONE_ROOT) => {
  const onFolderSelect = jest.fn();
  global.fetch = jest.fn(buildFolderFetch(tree)) as unknown as typeof fetch;
  const ref = createRef<FolderTreeHandle>();
  const utils = render(
    <Harness>
      <FolderTree
        ref={ref}
        documentSetId="ds-1"
        activeFolderId={null}
        onFolderSelect={onFolderSelect}
        isReadOnly={false}
        {...overrides}
      />
    </Harness>,
  );
  return { ...utils, onFolderSelect, ref };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FolderTree', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows skeleton rows while the tree is loading', () => {
    // Never resolves — keeps component in loading state.
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    // Skeleton components are rendered as placeholders; nav role still present.
    expect(screen.getByRole('navigation', { name: 'Folders' })).toBeInTheDocument();
  });

  it('has no axe violations in the loading state', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows an error message when the tree request fails', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    expect(await screen.findByText('Could not load folders.')).toBeInTheDocument();
  });

  it('has no axe violations in the error state', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    await screen.findByText('Could not load folders.');
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Stale collection (403 / 404) ──────────────────────────────────────────────

  it('fires onStaleDocset and shows the unavailable notice on a 404', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const onStaleDocset = jest.fn();
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
          onStaleDocset={onStaleDocset}
        />
      </Harness>,
    );
    expect(await screen.findByText('This collection is no longer available.')).toBeInTheDocument();
    expect(screen.queryByText('Could not load folders.')).not.toBeInTheDocument();
    expect(onStaleDocset).toHaveBeenCalledTimes(1);
  });

  it('fires onStaleDocset on a 403', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    const onStaleDocset = jest.fn();
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
          onStaleDocset={onStaleDocset}
        />
      </Harness>,
    );
    await screen.findByText('This collection is no longer available.');
    expect(onStaleDocset).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations in the stale-collection state', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
          onStaleDocset={() => {}}
        />
      </Harness>,
    );
    await screen.findByText('This collection is no longer available.');
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows the empty state when the tree has no roots', async () => {
    renderTree({}, TREE_EMPTY);
    expect(await screen.findByText('No folders yet')).toBeInTheDocument();
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = renderTree({}, TREE_EMPTY);
    await screen.findByText('No folders yet');
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Loaded state ────────────────────────────────────────────────────────────

  it('renders the All files button and folder names', async () => {
    renderTree();
    expect(await screen.findByRole('button', { name: 'All files' })).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('has no axe violations in the loaded state', async () => {
    const { container } = renderTree();
    await screen.findByText('Alpha');
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not render mutation affordances when isReadOnly=true', async () => {
    renderTree({ isReadOnly: true });
    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: /Rename Alpha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Alpha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create folder at root level' })).not.toBeInTheDocument();
  });

  it('renders folder buttons with a native title tooltip for truncation', async () => {
    renderTree();
    const alpha = await screen.findByRole('button', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('title', 'Alpha');
  });

  // Regression: the footer "New folder" button must stay rendered as a sibling
  // of the folder list, not inside the scrollable list region, so it remains
  // visible at the bottom of the pane whether the user has zero or many folders.
  it('keeps the New folder footer button rendered alongside the folder tree', async () => {
    renderTree();
    await screen.findByText('Alpha');
    const footer = screen.getByRole('button', { name: 'Create folder at root level' });
    expect(footer).toBeInTheDocument();
    // The footer must not live inside the role="tree" list — it has to be a
    // sibling so layout/scroll on the list never pushes it out of view.
    expect(screen.getByRole('tree', { name: 'Folder tree' })).not.toContainElement(footer);
  });

  // ── Selection ───────────────────────────────────────────────────────────────

  it('calls onFolderSelect(null) when All files is clicked', async () => {
    const user = userEvent.setup();
    const { onFolderSelect } = renderTree({ activeFolderId: 'f-alpha' });
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'All files' }));
    expect(onFolderSelect).toHaveBeenCalledWith(null);
  });

  it('calls onFolderSelect(folderId) when a folder button is clicked', async () => {
    const user = userEvent.setup();
    const { onFolderSelect } = renderTree();
    const alphaBtn = await screen.findByRole('button', { name: 'Alpha' });
    await user.click(alphaBtn);
    expect(onFolderSelect).toHaveBeenCalledWith('f-alpha');
  });

  // ── Expand / collapse ───────────────────────────────────────────────────────

  it('expanding a folder reveals its child', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    expect(screen.queryByText('Sub Alpha')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    expect(await screen.findByText('Sub Alpha')).toBeInTheDocument();
  });

  it('collapsing a folder hides its child', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    await screen.findByText('Sub Alpha');
    await user.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(screen.queryByText('Sub Alpha')).not.toBeInTheDocument();
  });

  it('has no axe violations when a folder is expanded', async () => {
    const user = userEvent.setup();
    const { container } = renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    await screen.findByText('Sub Alpha');
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Inline rename ───────────────────────────────────────────────────────────

  it('shows a rename input when the rename action is clicked', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    expect(screen.getByRole('textbox', { name: 'Rename Alpha' })).toBeInTheDocument();
  });

  it('submits the rename on Enter and calls the API', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    const input = screen.getByRole('textbox', { name: 'Rename Alpha' });
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/folders/f-alpha'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('cancels rename on Escape without calling the API', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    const patchCallsBefore = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    ).length;
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    screen.getByRole('textbox', { name: 'Rename Alpha' }); // assert input is present before pressing Escape
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Rename Alpha' })).not.toBeInTheDocument();
    const patchCallsAfter = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    ).length;
    expect(patchCallsAfter).toBe(patchCallsBefore);
  });

  it('has no axe violations while a rename input is open', async () => {
    const user = userEvent.setup();
    const { container } = renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Create folder ───────────────────────────────────────────────────────────

  it('shows an inline create input when New folder is clicked', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Create folder at root level' }));
    expect(screen.getByRole('textbox', { name: 'New folder name' })).toBeInTheDocument();
  });

  it('submits create on Enter and calls the API', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Create folder at root level' }));
    const input = screen.getByRole('textbox', { name: 'New folder name' });
    await user.type(input, 'New Folder{Enter}');
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/folders'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  it('opens the delete confirmation modal when delete is clicked', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(
      await screen.findByRole('dialog', { name: /Delete folder Alpha/ }),
    ).toBeInTheDocument();
  });

  it('calls the delete API and closes the modal on confirm', async () => {
    const user = userEvent.setup();
    renderTree({ activeFolderId: 'f-alpha' });
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await screen.findByRole('dialog', { name: /Delete folder Alpha/ });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/folders/f-alpha'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('calls onFolderSelect(null) when the active folder is deleted', async () => {
    const user = userEvent.setup();
    const { onFolderSelect } = renderTree({ activeFolderId: 'f-alpha' });
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await screen.findByRole('dialog', { name: /Delete folder Alpha/ });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onFolderSelect).toHaveBeenCalledWith(null));
  });

  it('dismisses the delete modal when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await screen.findByRole('dialog', { name: /Delete folder Alpha/ });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: /Delete folder Alpha/ })).not.toBeInTheDocument();
  });

  it('has no axe violations while the delete modal is open', async () => {
    const user = userEvent.setup();
    const { container } = renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await screen.findByRole('dialog', { name: /Delete folder Alpha/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── revealFolder imperative handle ──────────────────────────────────────────

  it('expands ancestors of the target folder when revealFolder is called', async () => {
    const { ref } = renderTree();
    await screen.findByText('Alpha');
    expect(screen.queryByText('Sub Alpha')).not.toBeInTheDocument();
    await act(async () => {
      ref.current?.revealFolder('f-sub');
    });
    expect(screen.getByText('Sub Alpha')).toBeInTheDocument();
  });

  it('does not dispatch EXPAND_MANY when all ancestors are already expanded', async () => {
    // expand Alpha first so EXPAND_MANY with that ancestor is a no-op
    const user = userEvent.setup();
    const { ref } = renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    await screen.findByText('Sub Alpha');
    // Now reveal Sub Alpha again — ancestors already expanded, EXPAND_MANY newIds.length === 0
    await act(async () => {
      ref.current?.revealFolder('f-sub');
    });
    expect(screen.getByText('Sub Alpha')).toBeInTheDocument();
  });

  it('is a no-op if treeData is not yet loaded when revealFolder is called', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const ref = createRef<FolderTreeHandle>();
    render(
      <Harness>
        <FolderTree
          ref={ref}
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    // Should not throw even when treeData is undefined
    expect(() => ref.current?.revealFolder('f-sub')).not.toThrow();
  });

  // ── EXPAND dedup (state.ts EXPAND branch — already expanded) ────────────────

  it('dispatching EXPAND on an already-expanded folder leaves state unchanged', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    await screen.findByText('Sub Alpha');
    // Click expand again on the already-collapsed state to hit the COLLAPSE branch
    await user.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(screen.queryByText('Sub Alpha')).not.toBeInTheDocument();
    // Expand once more to cover both EXPAND branches
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    await screen.findByText('Sub Alpha');
  });

  // ── Rename edge cases ───────────────────────────────────────────────────────

  it('does nothing when rename is submitted with empty/whitespace value', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    const input = screen.getByRole('textbox', { name: 'Rename Alpha' });
    await user.clear(input);
    await user.keyboard('{Enter}');
    // Input should be gone (rename cancelled), no PATCH call made
    expect(screen.queryByRole('textbox', { name: 'Rename Alpha' })).not.toBeInTheDocument();
    const patchCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('shows a toast when the rename API returns an error', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(
      (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/folders') && method === 'GET')
          return Promise.resolve(buildOkResponse(TREE_ONE_ROOT));
        if (url.includes('/folders/') && method === 'PATCH')
          return Promise.resolve(new Response(JSON.stringify({ title: 'Error', detail: 'Server error' }), { status: 500, headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' } }));
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    ) as unknown as typeof fetch;
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename Alpha' }), '{Enter}');
    // Error toast appears (either generic or API message)
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Rename Alpha' })).not.toBeInTheDocument(),
    );
  });

  // ── Create folder edge cases ────────────────────────────────────────────────

  it('cancels the create row when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Create folder at root level' }));
    screen.getByRole('textbox', { name: 'New folder name' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'New folder name' })).not.toBeInTheDocument();
  });

  it('cancels the create row when input loses focus with an empty name', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Create folder at root level' }));
    screen.getByRole('textbox', { name: 'New folder name' });
    // Tab away (blur with empty input) → should cancel
    await user.tab();
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'New folder name' })).not.toBeInTheDocument(),
    );
  });

  it('shows a toast when the create API returns an error', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(
      (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/folders') && method === 'GET')
          return Promise.resolve(buildOkResponse(TREE_ONE_ROOT));
        if (url.includes('/folders') && method === 'POST')
          return Promise.resolve(new Response(null, { status: 500, headers: { 'X-Operation-Id': 'op' } }));
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    ) as unknown as typeof fetch;
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Create folder at root level' }));
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Bad{Enter}');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'New folder name' })).not.toBeInTheDocument(),
    );
  });

  // ── Delete error toast ──────────────────────────────────────────────────────

  it('shows a toast when the delete API returns an error', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(
      (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/folders') && method === 'GET')
          return Promise.resolve(buildOkResponse(TREE_ONE_ROOT));
        if (url.includes('/folders/') && method === 'DELETE')
          return Promise.resolve(new Response(null, { status: 500, headers: { 'X-Operation-Id': 'op' } }));
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    ) as unknown as typeof fetch;
    render(
      <Harness>
        <FolderTree
          documentSetId="ds-1"
          activeFolderId={null}
          onFolderSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await screen.findByRole('dialog', { name: /Delete folder Alpha/ });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Delete folder Alpha/ })).not.toBeInTheDocument(),
    );
  });

  // ── Drag-and-drop ───────────────────────────────────────────────────────────

  it('fires DnD handlers: dragStart, dragOver (valid), drop, dragEnd', async () => {
    renderTree();
    const alphaRow = (await screen.findByText('Alpha')).closest('li')!;
    const betaRowDiv = screen.getByText('Beta').closest('[draggable]')!;

    // dragStart on Alpha
    fireEvent.dragStart(alphaRow.querySelector('[draggable]')!);

    // dragOver on Beta (valid target — Beta is not a descendant of Alpha)
    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'preventDefault', { value: jest.fn() });
    fireEvent(betaRowDiv, dragOverEvent);

    // drop on Beta
    fireEvent.drop(betaRowDiv);

    // dragEnd
    fireEvent.dragEnd(alphaRow.querySelector('[draggable]')!);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/move'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('fires DnD handlers: dragStart then dragOver/drop on All files button', async () => {
    renderTree();
    const alphaRow = (await screen.findByText('Alpha')).closest('li')!;
    const allFilesBtn = screen.getByRole('button', { name: 'All files' });

    fireEvent.dragStart(alphaRow.querySelector('[draggable]')!);

    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'preventDefault', { value: jest.fn() });
    fireEvent(allFilesBtn, dragOverEvent);

    fireEvent.drop(allFilesBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/move'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('prevents drop when target is a descendant of the dragged folder', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('Alpha');
    // Expand Alpha so Sub Alpha is in the DOM as a drop target.
    await user.click(screen.getByRole('button', { name: 'Expand Alpha' }));
    const subAlpha = await screen.findByText('Sub Alpha');

    const alphaRow = screen.getByText('Alpha').closest('li')!;
    const subAlphaRowDiv = subAlpha.closest('[draggable]')!;

    // Start a drag on Alpha, then actually drop on Sub Alpha (its descendant).
    fireEvent.dragStart(alphaRow.querySelector('[draggable]')!);
    fireEvent.dragOver(subAlphaRowDiv);
    fireEvent.drop(subAlphaRowDiv);

    // The cycle check must reject the drop — no /move call should be issued.
    // Wait a tick for any microtasks to flush before asserting "did not happen."
    await act(async () => {
      await Promise.resolve();
    });
    const moveCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes('/move'),
    );
    expect(moveCalls).toHaveLength(0);
  });

  // ── Document drop (slice A: document move) ──────────────────────────────────

  // Synthetic DataTransfer with the two MIME types the FileList sets when a
  // document row is dragged. jsdom's DragEvent has dataTransfer=null otherwise.
  const buildDocumentDataTransfer = (
    documentId: string,
    sourceFolderId: string | null,
  ) => {
    const store: Record<string, string> = {
      'application/x-mws-document-id': documentId,
      'application/x-mws-document-source-folder': sourceFolderId ?? '__root__',
    };
    return {
      types: Object.keys(store),
      getData: (mime: string) => store[mime] ?? '',
      setData: () => {},
      effectAllowed: 'move',
    } as unknown as DataTransfer;
  };

  it('routes a document drop to POST /documents/{id}/move with newFolderId', async () => {
    renderTree();
    const betaRowDiv = (await screen.findByText('Beta')).closest('[draggable]')!;
    const dataTransfer = buildDocumentDataTransfer('d-1', 'f-source');

    fireEvent.dragOver(betaRowDiv, { dataTransfer });
    fireEvent.drop(betaRowDiv, { dataTransfer });

    await waitFor(() => {
      const moveCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).match(/\/documents\/d-1\/move$/),
      );
      expect(moveCall).toBeDefined();
      const body = JSON.parse((moveCall![1] as RequestInit).body as string);
      expect(body).toEqual({ newFolderId: 'f-beta' });
    });
  });

  it('routes a document drop on All files to newFolderId=null', async () => {
    renderTree();
    await screen.findByText('Alpha');
    const allFilesBtn = screen.getByRole('button', { name: 'All files' });
    const dataTransfer = buildDocumentDataTransfer('d-1', 'f-source');

    fireEvent.dragOver(allFilesBtn, { dataTransfer });
    fireEvent.drop(allFilesBtn, { dataTransfer });

    await waitFor(() => {
      const moveCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).match(/\/documents\/d-1\/move$/),
      );
      expect(moveCall).toBeDefined();
      const body = JSON.parse((moveCall![1] as RequestInit).body as string);
      expect(body).toEqual({ newFolderId: null });
    });
  });

  it('skips the API call when the document is dropped on its own current folder', async () => {
    renderTree();
    const betaRowDiv = (await screen.findByText('Beta')).closest('[draggable]')!;
    // Source folder == target folder == f-beta — no-op.
    const dataTransfer = buildDocumentDataTransfer('d-1', 'f-beta');

    fireEvent.dragOver(betaRowDiv, { dataTransfer });
    fireEvent.drop(betaRowDiv, { dataTransfer });

    await act(async () => {
      await Promise.resolve();
    });
    const moveCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).match(/\/documents\/[^/]+\/move$/),
    );
    expect(moveCalls).toHaveLength(0);
  });

  it('sends newParentFolderId=null (not "__root__") when dropping on All files', async () => {
    renderTree();
    const alphaRow = (await screen.findByText('Alpha')).closest('li')!;
    const allFilesBtn = screen.getByRole('button', { name: 'All files' });

    fireEvent.dragStart(alphaRow.querySelector('[draggable]')!);
    fireEvent.dragOver(allFilesBtn);
    fireEvent.drop(allFilesBtn);

    await waitFor(() => {
      const moveCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).includes('/move'),
      );
      expect(moveCall).toBeDefined();
      const body = JSON.parse((moveCall![1] as RequestInit).body as string);
      expect(body).toEqual({ newParentFolderId: null });
    });
  });
});
