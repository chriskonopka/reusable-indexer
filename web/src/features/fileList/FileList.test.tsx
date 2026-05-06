import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentMetadataResponse, IndexerEvent, LevelContentsResponse } from '@shared/types';
import { HostProvider } from '../../host/HostContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider } from '../../hooks/useToast';
import { ToastViewport } from '../../components/Toast';
import { FileList } from './FileList';
import type { FileListProps } from './FileList';

// ─── Test data ────────────────────────────────────────────────────────────────

const makeDoc = (overrides: Partial<DocumentMetadataResponse> = {}): DocumentMetadataResponse => ({
  documentId: 'doc-1',
  documentSetId: 'ds-1',
  batchId: 'batch-1',
  folderId: null,
  fileName: 'contract.pdf',
  fileType: 'Contract',
  contentType: 'application/pdf',
  fileSizeBytes: 1024 * 500,
  status: 'Ready',
  chunkCount: 12,
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-04T12:00:00Z',
  ...overrides,
});

const LEVEL_RESPONSE = (docs: DocumentMetadataResponse[]): LevelContentsResponse => ({
  folderId: null,
  folders: [],
  documents: docs,
  folderCount: 0,
  documentCount: docs.length,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildOkResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'X-Operation-Id': 'op' },
  });

const installFetch = (response: LevelContentsResponse) => {
  global.fetch = jest.fn(
    async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/contents') && method === 'POST') {
        return buildOkResponse(response);
      }
      if (url.includes('/documents/') && method === 'DELETE') {
        return buildOkResponse({ documentId: 'doc-1' }, 202);
      }
      return new Response(null, { status: 404 });
    },
  ) as unknown as typeof fetch;
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
  events?: IndexerEvent[];
  children: ReactNode;
}

const Harness = ({ events, children }: HarnessProps) => {
  const queryClient = useMemo(buildQueryClient, []);
  return (
    <HostProvider
      value={{
        apiBaseUrl: 'https://test.invalid',
        getAccessToken: async () => 'tok',
        onEvent: events ? (e) => events.push(e) : () => {},
      }}
    >
      <ThemeProvider initialTheme="light">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {children}
            <ToastViewport />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};

const renderList = (
  overrides: Partial<FileListProps> = {},
  docs: DocumentMetadataResponse[] = [makeDoc()],
  events?: IndexerEvent[],
) => {
  const onDocumentSelect = jest.fn();
  installFetch(LEVEL_RESPONSE(docs));
  const utils = render(
    <Harness events={events}>
      <FileList
        documentSetId="ds-1"
        folderId={null}
        selectedDocumentId={null}
        onDocumentSelect={onDocumentSelect}
        isReadOnly={false}
        {...overrides}
      />
    </Harness>,
  );
  return { ...utils, onDocumentSelect };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileList', () => {
  afterEach(() => jest.restoreAllMocks());

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows skeleton while loading', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <Harness>
        <FileList
          documentSetId="ds-1"
          folderId={null}
          selectedDocumentId={null}
          onDocumentSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    // Skeletons present, table not yet visible.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has no axe violations in the loading state', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <FileList
          documentSetId="ds-1"
          folderId={null}
          selectedDocumentId={null}
          onDocumentSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows an error message when the request fails', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    render(
      <Harness>
        <FileList
          documentSetId="ds-1"
          folderId={null}
          selectedDocumentId={null}
          onDocumentSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    expect(await screen.findByText('Could not load documents.')).toBeInTheDocument();
  });

  it('has no axe violations in the error state', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <FileList
          documentSetId="ds-1"
          folderId={null}
          selectedDocumentId={null}
          onDocumentSelect={() => {}}
          isReadOnly={false}
        />
      </Harness>,
    );
    await screen.findByText('Could not load documents.');
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows the empty state when there are no documents', async () => {
    renderList({}, []);
    expect(await screen.findByText('No documents here')).toBeInTheDocument();
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = renderList({}, []);
    await screen.findByText('No documents here');
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Loaded state ────────────────────────────────────────────────────────────

  it('renders document rows in a table', async () => {
    renderList({}, [makeDoc(), makeDoc({ documentId: 'doc-2', fileName: 'brief.pdf' })]);
    expect(await screen.findByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
  });

  it('has no axe violations in the loaded state', async () => {
    const { container } = renderList();
    await screen.findByText('contract.pdf');
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not render delete buttons when isReadOnly=true', async () => {
    renderList({ isReadOnly: true });
    await screen.findByText('contract.pdf');
    expect(screen.queryByRole('button', { name: /Delete contract\.pdf/ })).not.toBeInTheDocument();
  });

  it('renders the file-name span with a native title tooltip for truncation', async () => {
    renderList();
    const span = await screen.findByText('contract.pdf');
    expect(span).toHaveAttribute('title', 'contract.pdf');
  });

  // ── Status badges ───────────────────────────────────────────────────────────

  it.each<[DocumentStatus, string]>([
    ['Pending', 'Pending'],
    ['Indexing', 'Indexing'],
    ['Ready', 'Ready'],
    ['Failed', 'Failed'],
  ])('renders a "%s" badge for status %s', async (status, label) => {
    renderList({}, [makeDoc({ status })]);
    await screen.findByText(label);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // ── Click to select ─────────────────────────────────────────────────────────

  it('calls onDocumentSelect with the documentId when a Ready row is clicked', async () => {
    const user = userEvent.setup();
    const { onDocumentSelect } = renderList();
    const row = await screen.findByRole('row', { name: /contract\.pdf/i });
    await user.click(row);
    expect(onDocumentSelect).toHaveBeenCalledWith('doc-1');
  });

  it('emits document/selected event when a Ready document is clicked', async () => {
    const user = userEvent.setup();
    const events: IndexerEvent[] = [];
    renderList({}, [makeDoc()], events);
    const row = await screen.findByRole('row', { name: /contract\.pdf/i });
    await user.click(row);
    await waitFor(() => {
      expect(events).toContainEqual({
        type: 'document/selected',
        documentSetId: 'ds-1',
        documentId: 'doc-1',
        folderId: null,
      });
    });
  });

  it('does not call onDocumentSelect when a non-Ready row is clicked', async () => {
    const user = userEvent.setup();
    const { onDocumentSelect } = renderList({}, [makeDoc({ status: 'Pending' })]);
    const row = await screen.findByRole('row', { name: /contract\.pdf/i });
    await user.click(row);
    expect(onDocumentSelect).not.toHaveBeenCalled();
  });

  // ── Properties panel ────────────────────────────────────────────────────────

  it('shows the DocumentPropertiesPanel when a document is selected', async () => {
    renderList({ selectedDocumentId: 'doc-1' }, [makeDoc()]);
    expect(
      await screen.findByRole('complementary', { name: 'Document properties' }),
    ).toBeInTheDocument();
  });

  it('has no axe violations when the properties panel is open', async () => {
    const { container } = renderList({ selectedDocumentId: 'doc-1' }, [makeDoc()]);
    await screen.findByRole('complementary', { name: 'Document properties' });
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('calls onDocumentSelect(null) when the panel close button is clicked', async () => {
    const user = userEvent.setup();
    const { onDocumentSelect } = renderList({ selectedDocumentId: 'doc-1' }, [makeDoc()]);
    await screen.findByRole('complementary', { name: 'Document properties' });
    await user.click(screen.getByRole('button', { name: 'Close document properties' }));
    expect(onDocumentSelect).toHaveBeenCalledWith(null);
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  it('opens delete modal when the row delete button is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('contract.pdf');
    await user.click(screen.getByRole('button', { name: 'Delete contract.pdf' }));
    expect(
      await screen.findByRole('dialog', { name: /Delete document contract\.pdf/ }),
    ).toBeInTheDocument();
  });

  it('calls the delete API and closes modal on confirm', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('contract.pdf');
    await user.click(screen.getByRole('button', { name: 'Delete contract.pdf' }));
    await screen.findByRole('dialog', { name: /Delete document contract\.pdf/ });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('calls onDocumentSelect(null) when the selected document is deleted', async () => {
    const user = userEvent.setup();
    const { onDocumentSelect } = renderList({ selectedDocumentId: 'doc-1' }, [makeDoc()]);
    // Panel + row both show the filename — wait for the table row specifically.
    await screen.findByRole('row', { name: /contract\.pdf/i });
    await user.click(screen.getByRole('button', { name: 'Delete contract.pdf' }));
    const deleteDialog = await screen.findByRole('dialog', { name: /Delete document contract\.pdf/ });
    // Use within-dialog to avoid ambiguity with the panel's "Delete" button.
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDocumentSelect).toHaveBeenCalledWith(null));
  });

  it('dismisses the delete modal when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('contract.pdf');
    await user.click(screen.getByRole('button', { name: 'Delete contract.pdf' }));
    await screen.findByRole('dialog', { name: /Delete document contract\.pdf/ });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: /Delete document contract\.pdf/ }),
    ).not.toBeInTheDocument();
  });

  it('has no axe violations with the delete modal open', async () => {
    const user = userEvent.setup();
    const { container } = renderList();
    await screen.findByText('contract.pdf');
    await user.click(screen.getByRole('button', { name: 'Delete contract.pdf' }));
    await screen.findByRole('dialog', { name: /Delete document contract\.pdf/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  // ── Reveal-document highlight + scroll ───────────────────────────────────────

  it('applies the highlight class to the matching row when highlightedDocumentId is set', async () => {
    renderList({ highlightedDocumentId: 'doc-1' }, [makeDoc()]);
    const row = await screen.findByRole('row', { name: /contract\.pdf/i });
    // The class name is hashed by CSS modules — match the unhashed segment.
    expect(row.className).toMatch(/rowHighlighted/);
  });

  it('does not apply the highlight class to rows that do not match', async () => {
    renderList({ highlightedDocumentId: 'doc-other' }, [makeDoc()]);
    const row = await screen.findByRole('row', { name: /contract\.pdf/i });
    expect(row.className).not.toMatch(/rowHighlighted/);
  });

  it('scrolls the highlighted row into view when revealed', async () => {
    // setupTests installs a no-op scrollIntoView; spy on it for this test.
    const scrollSpy = jest.spyOn(Element.prototype, 'scrollIntoView');
    renderList({ highlightedDocumentId: 'doc-1' }, [makeDoc()]);
    await screen.findByRole('row', { name: /contract\.pdf/i });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    // Sanity-check the args — should request smooth, centered scrolling.
    expect(scrollSpy.mock.calls[0][0]).toMatchObject({ behavior: 'smooth', block: 'center' });
    scrollSpy.mockRestore();
  });

  // ── Toolbar / sort / filter / search / bulk-select ──────────────────────────

  const docs3 = (): DocumentMetadataResponse[] => [
    makeDoc({ documentId: 'd-a', fileName: 'alpha.pdf', fileType: 'Contract', fileSizeBytes: 1024 * 100, updatedAt: '2026-05-04T10:00:00Z' }),
    makeDoc({ documentId: 'd-b', fileName: 'beta.pdf', fileType: 'Financial', fileSizeBytes: 1024 * 1024, updatedAt: '2026-05-03T10:00:00Z' }),
    makeDoc({ documentId: 'd-c', fileName: 'gamma.pdf', fileType: 'Contract', fileSizeBytes: 1024 * 50, updatedAt: '2026-05-05T10:00:00Z' }),
  ];

  const getRowOrder = (): string[] =>
    screen
      .getAllByRole('row')
      .slice(1) // skip header row
      .map((row) => row.getAttribute('data-document-id') ?? '');

  it('renders the toolbar (search + type filter) when documents are present', async () => {
    renderList({}, docs3());
    expect(await screen.findByRole('toolbar', { name: 'Document filters' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter by name' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toBeInTheDocument();
  });

  it('sorts by Name when the Name header is clicked', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.click(screen.getByRole('button', { name: /Name/ }));
    await waitFor(() => expect(getRowOrder()).toEqual(['d-a', 'd-b', 'd-c']));
    // Click again to reverse direction.
    await user.click(screen.getByRole('button', { name: /Name/ }));
    await waitFor(() => expect(getRowOrder()).toEqual(['d-c', 'd-b', 'd-a']));
  });

  it('sets aria-sort on the active column header', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    // Name first-click defaults to ascending (A-Z) for string columns.
    await user.click(screen.getByRole('button', { name: /Name/ }));
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    // Inactive columns report aria-sort="none".
    expect(screen.getByRole('columnheader', { name: /Size/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('default sort is Updated descending (newest first)', async () => {
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    // gamma (May 5) → alpha (May 4) → beta (May 3)
    await waitFor(() => expect(getRowOrder()).toEqual(['d-c', 'd-a', 'd-b']));
  });

  it('filters by type via the dropdown', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by type' }),
      'Financial',
    );
    expect(screen.queryByText('alpha.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('beta.pdf')).toBeInTheDocument();
    expect(screen.queryByText('gamma.pdf')).not.toBeInTheDocument();
  });

  it('filters by name via the debounced search input', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.type(screen.getByRole('searchbox', { name: 'Filter by name' }), 'gam');
    // Debounce is 200ms — waitFor's default 1000ms timeout covers it.
    await waitFor(() => expect(screen.queryByText('alpha.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('gamma.pdf')).toBeInTheDocument();
  });

  it('shows the "No files match" empty state when filter excludes all', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.type(
      screen.getByRole('searchbox', { name: 'Filter by name' }),
      'no-such-filename-xyz',
    );
    await waitFor(() => expect(screen.queryByText('alpha.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('No files match')).toBeInTheDocument();
    expect(screen.getByText(/Try a different filter/)).toBeInTheDocument();
  });

  it('header checkbox selects/deselects all visible rows', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');

    const headerCheckbox = screen.getByRole('checkbox', {
      name: /Select all visible|Deselect all visible/,
    });
    await user.click(headerCheckbox);
    // After selecting all, the bulk action should appear with "3 selected".
    expect(await screen.findByText('3 selected')).toBeInTheDocument();
    // Per-row checkboxes are now checked.
    expect(screen.getByRole('checkbox', { name: 'Select alpha.pdf' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select beta.pdf' })).toBeChecked();

    await user.click(headerCheckbox);
    expect(screen.queryByText('3 selected')).not.toBeInTheDocument();
  });

  it('per-row checkbox toggles selection without opening the panel', async () => {
    const user = userEvent.setup();
    const { onDocumentSelect } = renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.click(screen.getByRole('checkbox', { name: 'Select alpha.pdf' }));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(onDocumentSelect).not.toHaveBeenCalled();
  });

  it('bulk-deletes all selected documents via the bulk action', async () => {
    const user = userEvent.setup();
    renderList({}, docs3());
    await screen.findByText('alpha.pdf');

    await user.click(screen.getByRole('checkbox', { name: 'Select alpha.pdf' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select beta.pdf' }));

    await user.click(screen.getByRole('button', { name: /Delete 2 selected/ }));
    const dialog = await screen.findByRole('dialog', { name: /Delete 2 documents/ });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) =>
          (init as RequestInit | undefined)?.method === 'DELETE' &&
          String(url).includes('/documents/'),
      );
      // Two delete calls — one per selected doc.
      expect(deleteCalls).toHaveLength(2);
    });
  });

  it('does not render checkboxes or bulk actions in read-only mode', async () => {
    renderList({ isReadOnly: true }, docs3());
    await screen.findByText('alpha.pdf');
    expect(
      screen.queryByRole('checkbox', { name: /Select all visible/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select alpha.pdf' }),
    ).not.toBeInTheDocument();
  });

  it('has no axe violations with the toolbar + bulk action visible', async () => {
    const user = userEvent.setup();
    const { container } = renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.click(screen.getByRole('checkbox', { name: 'Select alpha.pdf' }));
    await screen.findByText('1 selected');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations on the "no files match" empty state', async () => {
    const user = userEvent.setup();
    const { container } = renderList({}, docs3());
    await screen.findByText('alpha.pdf');
    await user.type(
      screen.getByRole('searchbox', { name: 'Filter by name' }),
      'no-such-filename-xyz',
    );
    await screen.findByText('No files match');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// TypeScript helper — the test uses `DocumentStatus` as a value.
type DocumentStatus = DocumentMetadataResponse['status'];
