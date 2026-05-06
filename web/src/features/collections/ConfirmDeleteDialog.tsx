import type { DocumentSetSummary } from '@shared/types';
import { Button } from '../../components/Button';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../../components/Modal';

interface ConfirmDeleteDialogProps {
  target: DocumentSetSummary | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteDialog = ({
  target,
  loading,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) => (
  <Modal
    isOpen={target !== null}
    ariaLabel={target ? `Delete ${target.name}` : 'Delete collection'}
    onClose={onCancel}
  >
    <ModalHeader>Delete collection</ModalHeader>
    <ModalBody>
      <p>
        This will hide <strong>{target?.name}</strong> from your collections list. Documents
        stay indexed.
      </p>
    </ModalBody>
    <ModalFooter>
      <Button variant="secondary" onClick={onCancel} disabled={loading}>
        Cancel
      </Button>
      <Button onClick={onConfirm} loading={loading}>
        Delete
      </Button>
    </ModalFooter>
  </Modal>
);
