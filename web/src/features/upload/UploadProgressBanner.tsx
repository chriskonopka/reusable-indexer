import { useMemo } from 'react';
import { CaretDown, CaretUp, X } from '@phosphor-icons/react';
import type { UploadFile } from '@shared/types';
import { Pill } from '../../components/Pill';
import { Button } from '../../components/Button';
import { useKeyboardEscape } from '../../hooks/useKeyboardEscape';
import { computeTotals } from './aggregates';
import { useUploadState } from './state';
import type { UploadController } from './useUploadController';
import styles from './UploadProgressBanner.module.css';

// Persistent bottom-of-viewport banner shown while a session has files.
// Spec 3.5.3.

export interface UploadProgressBannerProps {
  controller: UploadController;
  /** Called when the user clicks "View" — host jumps to source collection. */
  onJumpToSourceCollection?: () => void;
  /** Whether the banner's source collection is the currently active one. */
  isViewingSource: boolean;
}

const statusLine = (
  totals: ReturnType<typeof computeTotals>,
  inFlight: boolean,
): string => {
  if (totals.total === 0) return 'Ready to upload';
  const indexingPart = inFlight
    ? `Indexing — ${totals.indexed} of ${totals.total} indexed`
    : `Indexed ${totals.indexed} of ${totals.total}`;
  if (totals.failed === 0 && totals.skipped === 0) return indexingPart;
  const failed = totals.failed > 0 ? `${totals.failed} failed` : '';
  const skipped = totals.skipped > 0 ? `${totals.skipped} skipped` : '';
  const tail = [failed, skipped].filter(Boolean).join(' · ');
  return `${indexingPart}${tail.length > 0 ? ` · ${tail}` : ''}`;
};

const rowToneFor = (file: UploadFile): 'info' | 'success' | 'warning' | 'error' | 'neutral' => {
  switch (file.status) {
    case 'Indexed':
      return 'success';
    case 'Failed':
      return 'error';
    case 'Unsupported':
    case 'Duplicate':
      return 'warning';
    case 'Submitted':
    case 'Indexing':
      return 'info';
    case 'Uploading':
      return 'info';
    default:
      return 'neutral';
  }
};

const statusLabel = (file: UploadFile): string => {
  switch (file.status) {
    case 'Queued':
      return 'Queued';
    case 'Uploading':
      return 'Uploading';
    case 'Submitted':
      return 'Queued';
    case 'Indexing':
      return 'Indexing';
    case 'Indexed':
      return 'Indexed';
    case 'Failed':
      return 'Failed';
    case 'Duplicate':
      return 'Duplicate';
    case 'Unsupported':
      return 'Skipped';
  }
};

export const UploadProgressBanner = ({
  controller,
  onJumpToSourceCollection,
  isViewingSource,
}: UploadProgressBannerProps) => {
  const state = useUploadState();
  const totals = useMemo(() => computeTotals(state.files), [state.files]);

  // Spec 5.4 — Escape collapses the expanded panel.
  useKeyboardEscape(state.bannerExpanded, controller.toggleBanner);

  if (state.files.length === 0) return null;

  const summary = statusLine(totals, controller.isInFlight);

  return (
    <section className={styles.banner} aria-label="Upload progress">
      <header className={styles.header}>
        <div className={styles.summary} aria-live="polite" aria-atomic="true">
          {summary}
        </div>
        <div className={styles.controls}>
          {!isViewingSource && onJumpToSourceCollection && (
            <Button size="small" variant="secondary" onClick={onJumpToSourceCollection}>
              View
            </Button>
          )}
          <button
            type="button"
            className={styles.toggleButton}
            aria-expanded={state.bannerExpanded}
            aria-controls="upload-banner-detail"
            onClick={controller.toggleBanner}
          >
            {state.bannerExpanded ? (
              <>
                <CaretDown size={14} aria-hidden /> Hide details
              </>
            ) : (
              <>
                <CaretUp size={14} aria-hidden /> View progress
              </>
            )}
          </button>
          <button
            type="button"
            className={styles.dismissButton}
            aria-label="Dismiss progress banner"
            onClick={controller.clear}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>

      {state.bannerExpanded && (
        <div id="upload-banner-detail" className={styles.detail}>
          <table className={styles.table}>
            <caption className={styles.caption}>Files in this upload session</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.actionsHeader}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {state.files.map((file) => (
                <tr key={file.clientId} className={styles.row}>
                  <td className={styles.fileCell}>
                    <span className={styles.fileName} title={file.file.name}>
                      {file.file.name}
                    </span>
                    {file.failureReason && (
                      <span className={styles.reason}>{file.failureReason}</span>
                    )}
                  </td>
                  <td>
                    <Pill tone={rowToneFor(file)} label={statusLabel(file)} />
                  </td>
                  <td className={styles.actionsCell}>
                    {file.status === 'Failed' && file.retryable && (
                      <button
                        type="button"
                        className={styles.rowButton}
                        onClick={() => controller.retry(file.clientId)}
                        aria-label={`Retry ${file.file.name}`}
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => controller.dismiss(file.clientId)}
                      aria-label={`Dismiss ${file.file.name}`}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(totals.failed > 0 || totals.skipped > 0) && (
            <div className={styles.bulkActions}>
              <Button
                size="small"
                variant="secondary"
                onClick={controller.retryAll}
              >
                Retry all
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={controller.dismissFailures}
              >
                Dismiss all failed
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
