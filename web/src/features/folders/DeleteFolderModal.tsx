import { Modal, ModalBody, ModalFooter, ModalHeader } from '../../components/Modal';
import { Button } from '../../components/Button';

interface DeleteFolderModalProps {
  isOpen: boolean;
  folderName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteFolderModal = ({
  isOpen,
  folderName,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteFolderModalProps) => (
  <Modal isOpen={isOpen} ariaLabel={`Delete folder ${folderName}`} onClose={onCancel}>
    <ModalHeader>Delete folder</ModalHeader>
    <ModalBody>
      <p>
        Delete <strong>{folderName}</strong>? All subfolders and documents inside will also be
        permanently deleted. This cannot be undone.
      </p>
    </ModalBody>
    <ModalFooter>
      <Button variant="secondary" onClick={onCancel} disabled={isDeleting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onConfirm} loading={isDeleting}>
        Delete
      </Button>
    </ModalFooter>
  </Modal>
);
