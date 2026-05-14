import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { UploadFile } from '@shared/types';
import { FailedFilesPopover } from './FailedFilesPopover';

const file = (overrides: Partial<UploadFile> = {}): UploadFile => ({
  clientId: overrides.clientId ?? `cid-${Math.random()}`,
  file: new File(['x'], overrides.relativePath ?? 'a.pdf', {
    type: 'application/pdf',
  }),
  relativePath: overrides.relativePath ?? 'a.pdf',
  targetFolderId: overrides.targetFolderId ?? null,
  status: overrides.status ?? 'Failed',
  documentId: overrides.documentId ?? null,
  failureReason: overrides.failureReason ?? 'Could not extract',
  severity: overrides.severity ?? 'Fail',
  retryable: overrides.retryable ?? true,
});

const baseProps = {
  folderName: 'Contracts',
  failures: [
    file({
      clientId: '1',
      relativePath: 'flaky.pdf',
      status: 'Failed',
      severity: 'Fail',
      retryable: true,
      failureReason: 'Network error',
    }),
    file({
      clientId: '2',
      relativePath: 'note.txt',
      status: 'Unsupported',
      severity: 'Skip',
      retryable: false,
      failureReason: 'Unsupported file type.',
    }),
  ],
  onClose: jest.fn(),
  onDismiss: jest.fn(),
  onDismissAll: jest.fn(),
};

beforeEach(() => {
  baseProps.onClose = jest.fn();
  baseProps.onDismiss = jest.fn();
  baseProps.onDismissAll = jest.fn();
});

describe('FailedFilesPopover', () => {
  it('lists failures with their reasons', () => {
    render(<FailedFilesPopover {...baseProps} />);
    expect(screen.getByRole('dialog', { name: 'Issues in Contracts' })).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Unsupported file type.')).toBeInTheDocument();
  });

  it('does not render a Retry button on any row', () => {
    render(<FailedFilesPopover {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('fires onDismiss with the row id', async () => {
    render(<FailedFilesPopover {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss flaky.pdf' }));
    expect(baseProps.onDismiss).toHaveBeenCalledWith('1');
  });

  it('Dismiss all fires onDismissAll', async () => {
    render(<FailedFilesPopover {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));
    expect(baseProps.onDismissAll).toHaveBeenCalled();
  });

  it('shows the empty state when no failures remain', () => {
    render(<FailedFilesPopover {...baseProps} failures={[]} />);
    expect(screen.getByText('No issues remaining.')).toBeInTheDocument();
  });

  it('Escape closes the popover', async () => {
    render(<FailedFilesPopover {...baseProps} />);
    await userEvent.keyboard('{Escape}');
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('Close button closes the popover', async () => {
    render(<FailedFilesPopover {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close issues popover' }));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('has no axe violations with failures rendered', async () => {
    const { container } = render(<FailedFilesPopover {...baseProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<FailedFilesPopover {...baseProps} failures={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the file-name span with a native title tooltip for truncation', () => {
    render(<FailedFilesPopover {...baseProps} />);
    const span = screen.getByText('flaky.pdf');
    expect(span).toHaveAttribute('title', 'flaky.pdf');
  });
});
