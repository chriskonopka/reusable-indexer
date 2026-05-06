import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Modal, ModalBody, ModalFooter, ModalHeader } from './index';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} ariaLabel="confirm" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with role=dialog and aria-modal when open', () => {
    render(
      <Modal isOpen ariaLabel="confirm delete" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'confirm delete' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal isOpen ariaLabel="x" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal isOpen ariaLabel="x" onClose={onClose}>
        <button type="button">inner</button>
      </Modal>,
    );
    // Click the backdrop (the wrapping presentation div).
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal isOpen ariaLabel="x" onClose={onClose}>
        <button type="button">inner</button>
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'inner' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body overflow while open and restores on close', () => {
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <Modal isOpen={open} ariaLabel="x" onClose={() => setOpen(false)}>
            <p>body</p>
          </Modal>
        </>
      );
    };
    const original = document.body.style.overflow;
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe(original);
  });

  it('renders header / body / footer composition correctly', () => {
    render(
      <Modal isOpen ariaLabel="confirm" onClose={() => {}}>
        <ModalHeader>Confirm delete</ModalHeader>
        <ModalBody>are you sure?</ModalBody>
        <ModalFooter>
          <button type="button">cancel</button>
          <button type="button">delete</button>
        </ModalFooter>
      </Modal>,
    );

    expect(screen.getByRole('heading', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(screen.getByText('are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument();
  });

  it('has no axe violations when open with header/body/footer', async () => {
    const { container } = render(
      <Modal isOpen ariaLabel="confirm" onClose={() => {}}>
        <ModalHeader>Title</ModalHeader>
        <ModalBody>
          <p>body</p>
        </ModalBody>
        <ModalFooter>
          <button type="button">cancel</button>
          <button type="button">confirm</button>
        </ModalFooter>
      </Modal>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations when closed', async () => {
    const { container } = render(
      <Modal isOpen={false} ariaLabel="x" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
