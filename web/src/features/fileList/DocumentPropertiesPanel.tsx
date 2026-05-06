import { X } from '@phosphor-icons/react';
import type { DocumentMetadataResponse } from '@shared/types';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/Button';
import { relativeTimeLabel } from '../../utils/dateLabels';
import { formatBytes } from '../../utils/fileSize';
import { useDocumentMetadata } from './queries';
import styles from './DocumentPropertiesPanel.module.css';

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  value: string | null | undefined;
}

const FieldRow = ({ label, value }: FieldRowProps) => (
  <div className={styles.field}>
    <dt className={styles.fieldLabel}>{label}</dt>
    <dd className={styles.fieldValue}>{value ?? '—'}</dd>
  </div>
);

// ─── DocumentPropertiesPanel ──────────────────────────────────────────────────

export interface DocumentPropertiesPanelProps {
  documentSetId: string;
  documentId: string;
  /** Pre-fetched document data from the browse-contents response. If null,
   *  the panel fetches the metadata itself (e.g. when opened via revealDocument). */
  document: DocumentMetadataResponse | null;
  isReadOnly: boolean;
  onClose: () => void;
  onDeleteRequest: (doc: DocumentMetadataResponse) => void;
}

export const DocumentPropertiesPanel = ({
  documentId,
  document: docFromList,
  isReadOnly,
  onClose,
  onDeleteRequest,
}: DocumentPropertiesPanelProps) => {
  // Only fetch if the browse-contents result didn't include this document
  // (e.g. when revealDocument was called for a doc outside the current page).
  const { data: fetchedDoc } = useDocumentMetadata(docFromList ? null : documentId);
  const doc = docFromList ?? fetchedDoc ?? null;

  return (
    <aside className={styles.panel} aria-label="Document properties">
      <div className={styles.header}>
        <h2 className={styles.title} title={doc?.fileName ?? documentId}>
          {doc?.fileName ?? '—'}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close document properties"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {doc === null ? (
        <div className={styles.loading}>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : (
        <>
          <dl className={styles.fields}>
            <FieldRow label="Status" value={doc.status} />
            <FieldRow label="File type" value={doc.fileType} />
            <FieldRow label="Size" value={formatBytes(doc.fileSizeBytes)} />
            <FieldRow label="Chunk count" value={doc.chunkCount != null ? String(doc.chunkCount) : null} />
            <FieldRow label="Folder" value={doc.folderId ?? '—'} />
            <FieldRow
              label="Added"
              value={relativeTimeLabel(doc.createdAt)}
            />
            <FieldRow
              label="Updated"
              value={relativeTimeLabel(doc.updatedAt)}
            />
          </dl>

          {!isReadOnly && (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="small"
                onClick={() => onDeleteRequest(doc)}
              >
                Delete
              </Button>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
