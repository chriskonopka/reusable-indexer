import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { IndexerAppProps, IndexerEvent, IndexerHandle } from '@shared/types';
import { __resetIndexerDbForTests } from '../utils/idb';
import { IndexerApp } from './index';

const buildResponse = (status: number, body: unknown): Response => {
  const init: ResponseInit = {
    status,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  };
  return new Response(body === undefined ? null : JSON.stringify(body), init);
};

const installFetch = () => {
  global.fetch = jest.fn(async () =>
    buildResponse(200, { items: [], totalCount: 0, page: 1, pageSize: 100 }),
  ) as unknown as typeof fetch;
};

const makeHost = (overrides: Partial<IndexerAppProps> = {}): IndexerAppProps => ({
  apiBaseUrl: 'https://stub.invalid',
  getAccessToken: async () => 'stub-token',
  onEvent: () => {},
  ...overrides,
});

describe('IndexerApp scaffold', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
    installFetch();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the indexer header and sidebar landmarks', async () => {
    render(<IndexerApp {...makeHost()} />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Document Collections/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Active collection' })).toBeInTheDocument();
  });

  it('exposes selectCollection and revealDocument via the imperative ref', async () => {
    const ref = createRef<IndexerHandle>();
    render(<IndexerApp ref={ref} {...makeHost()} />);

    expect(typeof ref.current?.selectCollection).toBe('function');
    expect(typeof ref.current?.revealDocument).toBe('function');

    await act(async () => {
      ref.current?.selectCollection(null);
      ref.current?.revealDocument('doc-id');
    });
  });

  it('exposes deselectDocument, deselectFolder, and clearSelection on the imperative ref', async () => {
    const ref = createRef<IndexerHandle>();
    render(<IndexerApp ref={ref} {...makeHost()} />);

    expect(typeof ref.current?.deselectDocument).toBe('function');
    expect(typeof ref.current?.deselectFolder).toBe('function');
    expect(typeof ref.current?.clearSelection).toBe('function');

    // No-op safety: calling them with nothing selected must not throw.
    await act(async () => {
      ref.current?.deselectDocument('not-selected');
      ref.current?.deselectFolder('not-selected');
      ref.current?.clearSelection();
    });
  });

  it('emits collection/activated with null on first mount', async () => {
    const events: IndexerEvent[] = [];
    render(<IndexerApp {...makeHost({ onEvent: (e) => events.push(e) })} />);
    await waitFor(() => {
      expect(events).toContainEqual({
        type: 'collection/activated',
        documentSetId: null,
        accessRole: null,
      });
    });
  });

  it('toggles theme via the header toggle and persists the preference', async () => {
    render(<IndexerApp {...makeHost({ initialTheme: 'light' })} />);
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' });

    await act(async () => {
      toggle.click();
    });

    expect(window.localStorage.getItem('theme-preference')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('hides the header theme toggle when hideThemeToggle is true', async () => {
    render(<IndexerApp {...makeHost({ initialTheme: 'light', hideThemeToggle: true })} />);
    expect(screen.queryByRole('button', { name: /Switch to (dark|light) mode/ })).not.toBeInTheDocument();
    // initialTheme is still honoured — the toggle is the only thing suppressed.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('keeps the header theme toggle visible when hideThemeToggle is omitted or false', async () => {
    const { rerender } = render(<IndexerApp {...makeHost({ initialTheme: 'light' })} />);
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();

    rerender(<IndexerApp {...makeHost({ initialTheme: 'light', hideThemeToggle: false })} />);
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('has no axe violations with the theme toggle hidden', async () => {
    const { container } = render(
      <IndexerApp {...makeHost({ initialTheme: 'light', hideThemeToggle: true })} />,
    );
    await screen.findByText("Click 'New collection' to get started.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations on first paint', async () => {
    const { container } = render(<IndexerApp {...makeHost()} />);
    // Wait for the empty-state to render.
    await screen.findByText("Click 'New collection' to get started.");
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('stale active collection self-heal', () => {
    // A collection that exists in the list but whose folder/contents listing
    // 404s (deleted or unshared since the list was fetched). The indexer must
    // deselect it and re-emit collection/activated:null so the host drops its
    // /c/{id} deep-link — rather than dead-ending on "Could not load…".
    const installStaleCollectionFetch = () => {
      global.fetch = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/document-sets/list') && method === 'POST') {
          return buildResponse(200, {
            items: [
              {
                documentSetId: 'ds-1',
                name: 'Gone collection',
                accessRole: 'Owner',
                updatedAt: '2026-05-04T12:00:00Z',
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
          });
        }
        // The collection is gone: every scoped listing 404s.
        if (url.includes('/document-sets/ds-1/folders')) {
          return buildResponse(404, {
            type: 'about:blank',
            title: 'not found',
            status: 404,
            detail: 'Document set not found.',
          });
        }
        if (url.includes('/contents') && method === 'POST') {
          return buildResponse(404, {
            type: 'about:blank',
            title: 'not found',
            status: 404,
            detail: 'Document set not found.',
          });
        }
        if (url.endsWith('/shares/list') && method === 'POST') {
          return buildResponse(200, { items: [], totalCount: 0, page: 1, pageSize: 100 });
        }
        return buildResponse(200, { items: [], totalCount: 0, page: 1, pageSize: 100 });
      }) as unknown as typeof fetch;
    };

    it('deselects the collection and re-emits collection/activated:null when its listing 404s', async () => {
      installStaleCollectionFetch();
      const events: IndexerEvent[] = [];
      const ref = createRef<IndexerHandle>();
      render(<IndexerApp ref={ref} {...makeHost({ onEvent: (e) => events.push(e) })} />);

      // Wait for the collection list to populate the query cache so the
      // imperative select can resolve the access role.
      await screen.findByText('Gone collection');

      await act(async () => {
        ref.current?.selectCollection('ds-1');
      });

      // The folder/file listing 404s → the user sees a non-blocking notice...
      await screen.findByText(/Pick another from the list/i);

      // ...and the indexer self-heals: it emits collection/activated for ds-1,
      // then null once the stale listing is detected.
      await waitFor(() => {
        const activatedDs1 = events.findIndex(
          (e) => e.type === 'collection/activated' && e.documentSetId === 'ds-1',
        );
        expect(activatedDs1).toBeGreaterThanOrEqual(0);
        const clearedAfter = events
          .slice(activatedDs1 + 1)
          .some((e) => e.type === 'collection/activated' && e.documentSetId === null);
        expect(clearedAfter).toBe(true);
      });

      // The main pane falls back to the empty state.
      expect(await screen.findByText('Select a collection')).toBeInTheDocument();
    });
  });

  describe('mobile sidebar hamburger', () => {
    it('renders the hamburger with closed initial state and toggles aria-expanded', async () => {
      render(<IndexerApp {...makeHost()} />);
      const hamburger = screen.getByRole('button', { name: 'Open collections menu' });
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');
      expect(hamburger).toHaveAttribute('aria-controls', 'indexer-collections-sidebar');

      await act(async () => {
        hamburger.click();
      });

      expect(
        screen.getByRole('button', { name: 'Close collections menu' }),
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('renders the backdrop button only when the sidebar is open', async () => {
      render(<IndexerApp {...makeHost()} />);
      expect(
        screen.queryByRole('button', { name: 'Dismiss collections menu' }),
      ).not.toBeInTheDocument();

      const hamburger = screen.getByRole('button', { name: 'Open collections menu' });
      await act(async () => {
        hamburger.click();
      });

      // Backdrop is a distinct control (separate aria-label) so assistive
      // tech can query it independently of the header hamburger toggle.
      expect(
        screen.getByRole('button', { name: 'Dismiss collections menu' }),
      ).toBeInTheDocument();
    });

    it('closes the sidebar when Escape is pressed', async () => {
      render(<IndexerApp {...makeHost()} />);
      const hamburger = screen.getByRole('button', { name: 'Open collections menu' });
      await act(async () => {
        hamburger.click();
      });
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(
        screen.getByRole('button', { name: 'Open collections menu' }),
      ).toHaveAttribute('aria-expanded', 'false');
    });

    it('has no axe violations with the mobile sidebar overlay open', async () => {
      const { container } = render(<IndexerApp {...makeHost()} />);
      await screen.findByText("Click 'New collection' to get started.");
      const hamburger = screen.getByRole('button', { name: 'Open collections menu' });
      await act(async () => {
        hamburger.click();
      });
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
