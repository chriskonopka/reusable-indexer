import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DocumentMetadataResponse } from '@shared/types';
import { HostProvider } from '../../host/HostContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider } from '../../hooks/useToast';
import { ToastViewport } from '../../components/Toast';
import { DocumentPropertiesPanel } from './DocumentPropertiesPanel';

// ─── Test data ────────────────────────────────────────────────────────────────

const DOC: DocumentMetadataResponse = {
  documentId: 'doc-1',
  documentSetId: 'ds-1',
  batchId: 'batch-1',
  folderId: 'f-alpha',
  fileName: 'contract.pdf',
  fileType: 'Contract',
  contentType: 'application/pdf',
  fileSizeBytes: 1024 * 750,
  status: 'Ready',
  chunkCount: 8,
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-04T12:00:00Z',
};

const DOC_NO_CHUNKS: DocumentMetadataResponse = {
  ...DOC,
  chunkCount: null,
  folderId: null,
};

// ─── Harness ──────────────────────────────────────────────────────────────────

const buildQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

const Harness = ({ children }: { children: ReactNode }) => {
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
            {children}
            <ToastViewport />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};

const renderPanel = (doc: DocumentMetadataResponse | null = DOC, isReadOnly = false) => {
  const onClose = jest.fn();
  const onDeleteRequest = jest.fn();
  // No fetch needed when doc is provided; suppress network with a no-op mock.
  if (doc) {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  }
  const utils = render(
    <Harness>
      <DocumentPropertiesPanel
        documentSetId="ds-1"
        documentId={doc?.documentId ?? 'doc-1'}
        document={doc}
        isReadOnly={isReadOnly}
        onClose={onClose}
        onDeleteRequest={onDeleteRequest}
      />
    </Harness>,
  );
  return { ...utils, onClose, onDeleteRequest };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DocumentPropertiesPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the document file name as the heading', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'contract.pdf' })).toBeInTheDocument();
  });

  it('renders all metadata fields', () => {
    renderPanel();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Contract')).toBeInTheDocument();
    expect(screen.getByText('750.0 KB')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // chunkCount
  });

  it('shows "—" for null chunkCount', () => {
    renderPanel(DOC_NO_CHUNKS);
    // chunkCount row shows "—"
    const labels = screen.getAllByText('—');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "—" for null folderId', () => {
    renderPanel(DOC_NO_CHUNKS);
    const labels = screen.getAllByText('—');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the loading skeleton when doc is null', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <Harness>
        <DocumentPropertiesPanel
          documentSetId="ds-1"
          documentId="doc-1"
          document={null}
          isReadOnly={false}
          onClose={() => {}}
          onDeleteRequest={() => {}}
        />
      </Harness>,
    );
    // Panel is present but no metadata fields yet.
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Close document properties' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteRequest with the doc when Delete button is clicked', async () => {
    const user = userEvent.setup();
    const { onDeleteRequest } = renderPanel(DOC, false);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteRequest).toHaveBeenCalledWith(DOC);
  });

  it('does not render the Delete button when isReadOnly=true', () => {
    renderPanel(DOC, true);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('has no axe violations with a document loaded', async () => {
    const { container } = renderPanel();
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the loading state', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(
      <Harness>
        <DocumentPropertiesPanel
          documentSetId="ds-1"
          documentId="doc-1"
          document={null}
          isReadOnly={false}
          onClose={() => {}}
          onDeleteRequest={() => {}}
        />
      </Harness>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in read-only mode', async () => {
    const { container } = renderPanel(DOC, true);
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
  });
});
