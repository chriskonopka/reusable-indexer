import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { UploadDropzone } from './UploadDropzone';

const baseProps = {
  disabled: false,
  onDrop: jest.fn().mockResolvedValue(undefined),
  children: <div data-testid="content">content</div>,
};

beforeEach(() => {
  baseProps.onDrop = jest.fn().mockResolvedValue(undefined);
});

describe('UploadDropzone', () => {
  it('renders children and the toolbar when enabled', () => {
    render(<UploadDropzone {...baseProps} />);
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add folder' })).toBeInTheDocument();
  });

  it('hides the toolbar when disabled', () => {
    render(<UploadDropzone {...baseProps} disabled />);
    expect(screen.queryByRole('button', { name: 'Add files' })).not.toBeInTheDocument();
  });

  it('shows the drag overlay during a Files drag and clears on leave', async () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    fireEvent.dragEnter(root, {
      dataTransfer: { types: ['Files'] },
    });
    expect(root).toHaveAttribute('data-active-drop', 'true');
    fireEvent.dragLeave(root);
    expect(root).not.toHaveAttribute('data-active-drop');
  });

  it('ignores drags that do not include Files', () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    fireEvent.dragEnter(root, { dataTransfer: { types: ['text/uri-list'] } });
    expect(root).not.toHaveAttribute('data-active-drop');
  });

  it('calls onDrop with the DataTransfer on drop', async () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    fireEvent.dragEnter(root, { dataTransfer: { types: ['Files'] } });
    const fakeTransfer = { types: ['Files'], items: [], files: [] } as unknown as DataTransfer;
    fireEvent.drop(root, { dataTransfer: fakeTransfer });
    expect(baseProps.onDrop).toHaveBeenCalledWith({ dataTransfer: fakeTransfer });
  });

  it('routes the file picker change through onDrop', async () => {
    render(<UploadDropzone {...baseProps} />);
    const file = new File(['hi'], 'a.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Add files') as HTMLInputElement;
    await userEvent.upload(input, [file]);
    expect(baseProps.onDrop).toHaveBeenCalled();
  });

  it('does not respond to drops while disabled', () => {
    const { container } = render(<UploadDropzone {...baseProps} disabled />);
    const root = container.firstChild as HTMLElement;
    fireEvent.dragEnter(root, { dataTransfer: { types: ['Files'] } });
    expect(root).not.toHaveAttribute('data-active-drop');
  });

  it('has no axe violations in the default state', async () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations during a drag-over', async () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    fireEvent.dragEnter(root, { dataTransfer: { types: ['Files'] } });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations when disabled', async () => {
    const { container } = render(<UploadDropzone {...baseProps} disabled />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('dragOver sets dropEffect=copy on the DataTransfer', () => {
    const { container } = render(<UploadDropzone {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    const dt: { types: string[]; dropEffect: string } = {
      types: ['Files'],
      dropEffect: 'none',
    };
    fireEvent.dragOver(root, { dataTransfer: dt });
    expect(dt.dropEffect).toBe('copy');
  });

  it('opens the file picker when "Add files" is clicked', async () => {
    const click = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<UploadDropzone {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add files' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add folder' }));
    // Two clicks — one per visible input.
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
