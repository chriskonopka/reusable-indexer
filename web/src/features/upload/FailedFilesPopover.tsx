import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import type { UploadFile } from '@shared/types';
import { Button } from '../../components/Button';
import { Pill } from '../../components/Pill';
import { useKeyboardEscape } from '../../hooks/useKeyboardEscape';
import styles from './FailedFilesPopover.module.css';

// Popover listing every failed/skipped/duplicate file in a single folder.
// Spec 3.6.2 / 3.6.3 / 3.6.4. Triggered from the folder's badge.

export interface FailedFilesPopoverProps {
  folderName: string;
  failures: UploadFile[];
  onClose: () => void;
  onDismiss: (clientId: string) => void;
  onDismissAll: () => void;
}

export const FailedFilesPopover = ({
  folderName,
  failures,
  onClose,
  onDismiss,
  onDismissAll,
}: FailedFilesPopoverProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useKeyboardEscape(true, onClose);

  // Move focus into the popover on mount for keyboard users.
  useEffect(() => {
    containerRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);

  if (failures.length === 0) {
    return (
      <div
        ref={containerRef}
        className={styles.popover}
        role="dialog"
        aria-label={`Issues in ${folderName}`}
      >
        <div className={styles.header}>
          <h3 className={styles.heading}>{folderName}</h3>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close issues popover"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <p className={styles.empty}>No issues remaining.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.popover}
      role="dialog"
      aria-label={`Issues in ${folderName}`}
    >
      <div className={styles.header}>
        <h3 className={styles.heading}>{folderName}</h3>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close issues popover"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <ul className={styles.list}>
        {failures.map((file) => {
          const isSkip = file.status === 'Unsupported' || file.status === 'Duplicate';
          return (
            <li key={file.clientId} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.fileName} title={file.file.name}>
                  {file.file.name}
                </span>
                {file.failureReason && (
                  <span className={styles.reason}>{file.failureReason}</span>
                )}
              </div>
              <Pill
                tone={isSkip ? 'warning' : 'error'}
                label={
                  file.status === 'Duplicate'
                    ? 'Duplicate'
                    : file.status === 'Unsupported'
                      ? 'Skipped'
                      : 'Failed'
                }
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => onDismiss(file.clientId)}
                  aria-label={`Dismiss ${file.file.name}`}
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <Button size="small" variant="secondary" onClick={onDismissAll}>
          Dismiss all
        </Button>
      </div>
    </div>
  );
};
