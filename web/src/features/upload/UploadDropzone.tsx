import { ChangeEvent, DragEvent, ReactNode, useCallback, useRef, useState } from 'react';
import { CloudArrowUp } from '@phosphor-icons/react';
import { Button } from '../../components/Button';
import styles from './UploadDropzone.module.css';

// Drag-target overlay + file/folder picker entry. The drop event itself is
// handled by the parent (`useUploadController.acceptDrop`) — this component
// only manages the visual drag-over state and the picker plumbing.
//
// Spec 3.4.1, 3.4.4. Read-only collections render no upload affordance
// (spec 2.1) — the parent gates rendering on accessRole.

export interface UploadDropzoneProps {
  /** Disabled while no collection is active or the viewer is read-only. */
  disabled: boolean;
  /** Called with the raw DataTransfer / FileList; controller handles walking. */
  onDrop: (event: { dataTransfer?: DataTransfer; fileList?: FileList | null }) => Promise<void>;
  children: ReactNode;
}

interface DirectoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Non-standard attributes Chrome / Edge / Safari understand for folder
  // selection inside <input type="file">. They are not in the React HTML
  // typings yet, so we cast through this prop alias.
  webkitdirectory?: string;
  directory?: string;
}

export const UploadDropzone = ({
  disabled,
  onDrop,
  children,
}: UploadDropzoneProps) => {
  const [isDragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragOver(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragOver(false);
    },
    [disabled],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);
      // Snapshot the DataTransfer immediately — once the event handler returns
      // its files become inaccessible in some browsers.
      await onDrop({ dataTransfer: event.dataTransfer });
    },
    [disabled, onDrop],
  );

  const handlePickerChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        await onDrop({ fileList: files });
      }
      // Reset so re-selecting the same files re-fires change.
      event.target.value = '';
    },
    [onDrop],
  );

  const folderInputProps: DirectoryInputProps = {
    ref: folderInputRef,
    type: 'file',
    multiple: true,
    webkitdirectory: '',
    directory: '',
    onChange: handlePickerChange,
    'aria-label': 'Add folder',
    className: styles.hiddenInput,
  };

  return (
    <div
      className={[
        styles.dropzone,
        isDragOver ? styles.dropzoneActive : '',
        disabled ? styles.dropzoneDisabled : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-active-drop={isDragOver ? 'true' : undefined}
    >
      {!disabled && (
        <div className={styles.toolbar} aria-label="Upload toolbar">
          <Button size="small" onClick={() => fileInputRef.current?.click()}>
            Add files
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => folderInputRef.current?.click()}
          >
            Add folder
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            aria-label="Add files"
            className={styles.hiddenInput}
            onChange={handlePickerChange}
          />
          {/* Folder picker — see DirectoryInputProps for the non-standard attrs. */}
          <input {...folderInputProps} />
        </div>
      )}

      {isDragOver && !disabled && (
        <div
          className={styles.overlay}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <CloudArrowUp size={48} aria-hidden />
          <span className={styles.overlayLabel}>Drop to upload</span>
        </div>
      )}

      <div className={styles.content}>{children}</div>
    </div>
  );
};
