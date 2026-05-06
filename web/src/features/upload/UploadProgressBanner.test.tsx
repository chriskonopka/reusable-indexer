import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { UploadFile } from '@shared/types';
import { UploadProvider, useUploadDispatch, useUploadState } from './state';
import { UploadProgressBanner } from './UploadProgressBanner';
import type { UploadController } from './useUploadController';
import { ReactNode, useEffect } from 'react';

const file = (overrides: Partial<UploadFile> = {}): UploadFile => {
  const fileName = overrides.relativePath?.split('/').pop() ?? `file-${overrides.clientId ?? 'x'}.pdf`;
  return {
    clientId: overrides.clientId ?? `cid-${Math.random()}`,
    file: new File(['x'], fileName, { type: 'application/pdf' }),
    relativePath: overrides.relativePath ?? fileName,
    targetFolderId: overrides.targetFolderId ?? null,
    status: overrides.status ?? 'Queued',
    documentId: overrides.documentId ?? null,
    failureReason: overrides.failureReason ?? null,
    severity: overrides.severity ?? null,
    retryable: overrides.retryable ?? false,
  };
};

const Seed = ({ files, expanded }: { files: UploadFile[]; expanded?: boolean }) => {
  const dispatch = useUploadDispatch();
  useEffect(() => {
    dispatch({ type: 'START_SESSION', targetDocumentSetId: 'ds', files });
    if (expanded) dispatch({ type: 'SET_BANNER', expanded: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const buildController = (overrides: Partial<UploadController> = {}): UploadController => ({
  isInFlight: true,
  acceptDrop: jest.fn().mockResolvedValue(undefined),
  retry: jest.fn(),
  retryAll: jest.fn(),
  dismiss: jest.fn(),
  dismissFailures: jest.fn(),
  toggleBanner: jest.fn(),
  setBannerExpanded: jest.fn(),
  clear: jest.fn(),
  ...overrides,
});

const Harness = ({
  controller,
  files,
  expanded,
  isViewingSource = true,
  onJump,
}: {
  controller: UploadController;
  files: UploadFile[];
  expanded?: boolean;
  isViewingSource?: boolean;
  onJump?: () => void;
}): ReactNode => {
  return (
    <UploadProvider>
      <Seed files={files} expanded={expanded} />
      <UploadProgressBanner
        controller={controller}
        isViewingSource={isViewingSource}
        onJumpToSourceCollection={onJump}
      />
      <RawState />
    </UploadProvider>
  );
};

// Helper for assertions that don't need state directly.
const RawState = () => {
  useUploadState();
  return null;
};

describe('UploadProgressBanner', () => {
  it('renders nothing when there are no files', () => {
    const { container } = render(
      <UploadProvider>
        <UploadProgressBanner
          controller={buildController({ isInFlight: false })}
          isViewingSource
        />
      </UploadProvider>,
    );
    expect(container.querySelector('section')).toBeNull();
  });

  it('shows the in-flight summary with totals', () => {
    const files = [
      file({ clientId: '1', status: 'Indexed' }),
      file({ clientId: '2', status: 'Indexing' }),
      file({ clientId: '3', status: 'Failed', severity: 'Fail', failureReason: 'oops' }),
    ];
    render(<Harness controller={buildController()} files={files} />);
    expect(screen.getByText(/Indexing — 1 of 3 indexed · 1 failed/)).toBeInTheDocument();
  });

  it('shows the View button when not viewing the source collection', async () => {
    const onJump = jest.fn();
    render(
      <Harness
        controller={buildController()}
        files={[file({ clientId: '1', status: 'Uploading' })]}
        isViewingSource={false}
        onJump={onJump}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onJump).toHaveBeenCalled();
  });

  it('hides the View button when already on source collection', () => {
    render(
      <Harness
        controller={buildController()}
        files={[file({ clientId: '1', status: 'Uploading' })]}
        isViewingSource
        onJump={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });

  it('expanded banner exposes a per-file table with retry/dismiss', async () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        expanded
        files={[
          file({
            clientId: '1',
            relativePath: 'failing.pdf',
            status: 'Failed',
            severity: 'Fail',
            retryable: true,
            failureReason: 'network',
          }),
          file({ clientId: '2', relativePath: 'ok.pdf', status: 'Indexed' }),
        ]}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry failing.pdf' }));
    expect(controller.retry).toHaveBeenCalledWith('1');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss failing.pdf' }));
    expect(controller.dismiss).toHaveBeenCalledWith('1');
  });

  it('exposes Retry all / Dismiss all when there are failures', async () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        expanded
        files={[
          file({ clientId: '1', status: 'Failed', severity: 'Fail', retryable: true }),
          file({ clientId: '2', status: 'Failed', severity: 'Fail', retryable: true }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry all' }));
    expect(controller.retryAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss all failed' }));
    expect(controller.dismissFailures).toHaveBeenCalled();
  });

  it('toggleBanner is fired by the View progress button', async () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        files={[file({ clientId: '1', status: 'Indexing' })]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /View progress/ }));
    expect(controller.toggleBanner).toHaveBeenCalled();
  });

  it('clear is called from the dismiss-banner button', async () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        files={[file({ clientId: '1', status: 'Indexed' })]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss progress banner' }));
    expect(controller.clear).toHaveBeenCalled();
  });

  it('has no axe violations in the collapsed state', async () => {
    const { container } = render(
      <Harness
        controller={buildController()}
        files={[file({ clientId: '1', status: 'Uploading' })]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the expanded state with failures', async () => {
    const { container } = render(
      <Harness
        controller={buildController()}
        expanded
        files={[
          file({ clientId: '1', status: 'Failed', severity: 'Fail', retryable: true, failureReason: 'oops' }),
          file({ clientId: '2', status: 'Indexed' }),
        ]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a label for every per-file status', () => {
    render(
      <Harness
        controller={buildController()}
        expanded
        files={[
          file({ clientId: '1', relativePath: 'q.pdf', status: 'Queued' }),
          file({ clientId: '2', relativePath: 'u.pdf', status: 'Uploading' }),
          file({ clientId: '3', relativePath: 's.pdf', status: 'Submitted' }),
          file({ clientId: '4', relativePath: 'i.pdf', status: 'Indexing' }),
          file({ clientId: '5', relativePath: 'r.pdf', status: 'Indexed' }),
          file({ clientId: '6', relativePath: 'f.pdf', status: 'Failed', severity: 'Fail', retryable: false }),
          file({ clientId: '7', relativePath: 'd.pdf', status: 'Duplicate', severity: 'Skip' }),
          file({ clientId: '8', relativePath: 'x.pdf', status: 'Unsupported', severity: 'Skip' }),
        ]}
      />,
    );
    // "Queued" appears for both Queued and Submitted statuses; one cell each.
    expect(screen.getAllByText('Queued')).toHaveLength(2);
    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByText('Indexing')).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });

  it('shows a settled summary when the controller reports not-in-flight', () => {
    render(
      <Harness
        controller={buildController({ isInFlight: false })}
        files={[
          file({ clientId: '1', status: 'Indexed' }),
          file({ clientId: '2', status: 'Indexed' }),
        ]}
      />,
    );
    expect(screen.getByText('Indexed 2 of 2')).toBeInTheDocument();
  });

  it('Escape collapses the panel when expanded (spec 5.4)', () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        expanded
        files={[file({ clientId: '1', status: 'Indexing' })]}
      />,
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(controller.toggleBanner).toHaveBeenCalled();
  });

  it('Escape is a no-op when the panel is collapsed', () => {
    const controller = buildController();
    render(
      <Harness
        controller={controller}
        files={[file({ clientId: '1', status: 'Indexing' })]}
      />,
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(controller.toggleBanner).not.toHaveBeenCalled();
  });

  it('renders the file-name cell with a native title tooltip for truncation', () => {
    render(
      <Harness
        controller={buildController()}
        expanded
        files={[file({ clientId: '1', relativePath: 'tooltip-target.pdf', status: 'Indexing' })]}
      />,
    );
    const cell = screen.getByText('tooltip-target.pdf');
    expect(cell).toHaveAttribute('title', 'tooltip-target.pdf');
  });
});
