import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useKeyboardEscape } from '../../hooks/useKeyboardEscape';
import styles from './Modal.module.css';

// Accessible modal dialog. Focus trap, return-focus on close, Escape to close,
// click-outside dismissal. Renders into a body-level portal so backdrop +
// stacking work correctly. See web-accessibility.md.

interface ModalProps {
  isOpen: boolean;
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}

export const Modal = ({ isOpen, ariaLabel, onClose, children }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, dialogRef);
  useKeyboardEscape(isOpen, onClose);

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const onBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={styles.dialog}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

interface ModalHeaderProps {
  children: ReactNode;
}

export const ModalHeader = ({ children }: ModalHeaderProps) => (
  <div className={styles.header}>
    <h2 className={styles.title}>{children}</h2>
  </div>
);

interface ModalBodyProps {
  children: ReactNode;
}

export const ModalBody = ({ children }: ModalBodyProps) => (
  <div className={styles.body}>{children}</div>
);

interface ModalFooterProps {
  children: ReactNode;
}

export const ModalFooter = ({ children }: ModalFooterProps) => (
  <div className={styles.footer}>{children}</div>
);
