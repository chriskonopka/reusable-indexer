import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentMetadataResponse, DocumentStatus, FileTypeCode } from '@shared/types';
import {
  CaretDown,
  CaretUp,
  CaretUpDown,
  File,
  FileDoc,
  FilePdf,
  FileText,
  MagnifyingGlass,
  Spinner,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useToast } from '../../hooks/useToast';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useEmitEvent } from '../../host/useHost';
import { relativeTimeLabel } from '../../utils/dateLabels';
import { formatBytes } from '../../utils/fileSize';
import { useBrowseContents, useDeleteDocument } from './queries';
import { DocumentPropertiesPanel } from './DocumentPropertiesPanel';
import styles from './FileList.module.css';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DocumentStatus, string> = {
  Pending: 'Pending',
  Indexing: 'Indexing',
  Ready: 'Ready',
  Failed: 'Failed',
};

const STATUS_STYLE: Record<DocumentStatus, string> = {
  Pending: styles.statusPending,
  Indexing: styles.statusIndexing,
  Ready: styles.statusReady,
  Failed: styles.statusFailed,
};

// Status sort order — Pending first (waiting), Failed last (problems first to triage,
// then everything settled at the end). Matches typical pipeline-status views.
const STATUS_SORT_ORDER: Record<DocumentStatus, number> = {
  Pending: 0,
  Indexing: 1,
  Ready: 2,
  Failed: 3,
};

interface StatusBadgeProps {
  status: DocumentStatus;
}

const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span className={[styles.statusBadge, STATUS_STYLE[status]].join(' ')}>
    {status === 'Indexing' && <Spinner className={styles.spinner} size={12} aria-hidden />}
    {status === 'Failed' && <Warning size={12} aria-hidden />}
    {STATUS_LABELS[status]}
  </span>
);

// ─── File type icon ───────────────────────────────────────────────────────────

const FILE_TYPE_ICONS: Record<string, typeof File> = {
  'application/pdf': FilePdf,
  'application/msword': FileDoc,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileDoc,
  'text/plain': FileText,
};

interface FileIconProps {
  contentType: string;
}

const FileIcon = ({ contentType }: FileIconProps) => {
  const Icon = FILE_TYPE_ICONS[contentType] ?? File;
  return (
    <span className={styles.fileIcon} aria-hidden>
      <Icon size={18} />
    </span>
  );
};

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortColumn = 'name' | 'status' | 'type' | 'size' | 'updated';
type SortDirection = 'asc' | 'desc';

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

const DEFAULT_SORT: SortState = { column: 'updated', direction: 'desc' };

const SEARCH_DEBOUNCE_MS = 200;

const compareDocs = (
  a: DocumentMetadataResponse,
  b: DocumentMetadataResponse,
  column: SortColumn,
): number => {
  switch (column) {
    case 'name':
      return a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' });
    case 'status':
      return STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    case 'type':
      return a.fileType.localeCompare(b.fileType, undefined, { sensitivity: 'base' });
    case 'size':
      return a.fileSizeBytes - b.fileSizeBytes;
    case 'updated':
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  }
};

interface SortHeaderProps {
  column: SortColumn;
  label: string;
  sort: SortState;
  onSortChange: (column: SortColumn) => void;
  className?: string;
}

const SortHeader = ({ column, label, sort, onSortChange, className }: SortHeaderProps) => {
  const isActive = sort.column === column;
  const ariaSort = isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = !isActive ? CaretUpDown : sort.direction === 'asc' ? CaretUp : CaretDown;
  return (
    <th
      className={[styles.headerCell, className ?? ''].filter(Boolean).join(' ')}
      scope="col"
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSortChange(column)}
      >
        {label}
        <Icon size={12} className={styles.sortIcon} aria-hidden />
      </button>
    </th>
  );
};

// ─── Delete confirmation modal ────────────────────────────────────────────────

interface DeleteDocumentsModalProps {
  isOpen: boolean;
  docs: DocumentMetadataResponse[];
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteDocumentsModal = ({
  isOpen,
  docs,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteDocumentsModalProps) => {
  const isBulk = docs.length > 1;
  const ariaLabel = isBulk
    ? `Delete ${docs.length} documents`
    : `Delete document ${docs[0]?.fileName ?? ''}`;
  const title = isBulk ? `Delete ${docs.length} documents` : 'Delete document';
  return (
    <Modal isOpen={isOpen} ariaLabel={ariaLabel} onClose={onCancel}>
      <ModalHeader>{title}</ModalHeader>
      <ModalBody>
        {isBulk ? (
          <p>
            Delete <strong>{docs.length}</strong> documents? They will be permanently removed and
            cannot be recovered.
          </p>
        ) : (
          <p>
            Delete <strong>{docs[0]?.fileName}</strong>? This document will be permanently removed
            and cannot be recovered.
          </p>
        )}
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
};

// ─── Document row ─────────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: DocumentMetadataResponse;
  isSelected: boolean;
  isInBulkSelection: boolean;
  isHighlighted: boolean;
  isReadOnly: boolean;
  onSelect: (documentId: string) => void;
  onToggleBulkSelect: (documentId: string) => void;
  onDeleteRequest: (doc: DocumentMetadataResponse) => void;
}

const DocumentRowBase = ({
  doc,
  isSelected,
  isInBulkSelection,
  isHighlighted,
  isReadOnly,
  onSelect,
  onToggleBulkSelect,
  onDeleteRequest,
}: DocumentRowProps) => {
  const isReady = doc.status === 'Ready';
  return (
    <tr
      data-document-id={doc.documentId}
      className={[
        styles.row,
        isSelected ? styles.rowSelected : '',
        isReady ? styles.rowClickable : '',
        isHighlighted ? styles.rowHighlighted : '',
        isInBulkSelection ? styles.rowBulkSelected : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-selected={isSelected}
      onClick={isReady ? () => onSelect(doc.documentId) : undefined}
    >
      {!isReadOnly && (
        <td className={[styles.cell, styles.cellCheckbox].join(' ')}>
          <input
            type="checkbox"
            className={styles.checkbox}
            aria-label={`Select ${doc.fileName}`}
            checked={isInBulkSelection}
            onChange={() => onToggleBulkSelect(doc.documentId)}
            onClick={(event) => event.stopPropagation()}
          />
        </td>
      )}
      <td className={styles.cell}>
        <span className={styles.fileNameCell}>
          <FileIcon contentType={doc.contentType} />
          {/* Native tooltip for truncated names — the cell uses ellipsis. */}
          <span className={styles.fileName} title={doc.fileName}>
            {doc.fileName}
          </span>
        </span>
      </td>
      <td className={styles.cell}>
        <StatusBadge status={doc.status} />
      </td>
      <td className={[styles.cell, styles.cellMeta].join(' ')}>{doc.fileType}</td>
      <td className={[styles.cell, styles.cellMeta].join(' ')}>{formatBytes(doc.fileSizeBytes)}</td>
      <td className={[styles.cell, styles.cellMeta].join(' ')}>
        {relativeTimeLabel(doc.updatedAt)}
      </td>
      {!isReadOnly && (
        <td className={[styles.cell, styles.cellActions].join(' ')}>
          <button
            type="button"
            className={styles.deleteRowBtn}
            aria-label={`Delete ${doc.fileName}`}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteRequest(doc);
            }}
          >
            ×
          </button>
        </td>
      )}
    </tr>
  );
};
const DocumentRow = memo(DocumentRowBase);

// ─── FileList ─────────────────────────────────────────────────────────────────

const TYPE_FILTER_ALL = 'all' as const;

export interface FileListProps {
  documentSetId: string;
  folderId: string | null;
  selectedDocumentId: string | null;
  onDocumentSelect: (documentId: string | null) => void;
  isReadOnly: boolean;
  /** When set, the matching row gets a transient highlight class and is
   *  scrolled into view. Driven by RootShell.revealDocument(). */
  highlightedDocumentId?: string | null;
}

export const FileList = ({
  documentSetId,
  folderId,
  selectedDocumentId,
  onDocumentSelect,
  isReadOnly,
  highlightedDocumentId = null,
}: FileListProps) => {
  const { data, isLoading, isError } = useBrowseContents(documentSetId, folderId);
  const deleteMutation = useDeleteDocument();
  const { push: pushToast } = useToast();
  const emitEvent = useEmitEvent();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sort / filter / search / bulk-select state. All client-side; the wire
  // contract returns documents flat per folder.
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [typeFilter, setTypeFilter] = useState<FileTypeCode | typeof TYPE_FILTER_ALL>(
    TYPE_FILTER_ALL,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<DocumentMetadataResponse[] | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Reset selection when the folder changes — different folder, fresh slate.
  useEffect(() => {
    setBulkSelection(new Set());
  }, [folderId]);

  // When a document is revealed via RootShell.revealDocument(), scroll its row
  // into view once the documents query has resolved and the row is in the DOM.
  useEffect(() => {
    if (!highlightedDocumentId || !data) return;
    const row = tableContainerRef.current?.querySelector<HTMLElement>(
      `[data-document-id="${CSS.escape(highlightedDocumentId)}"]`,
    );
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedDocumentId, data]);

  // Distinct file types present in the loaded documents — drives the filter
  // dropdown so we only ever offer types the user can actually find.
  const availableTypes = useMemo<FileTypeCode[]>(() => {
    if (!data) return [];
    const set = new Set<FileTypeCode>();
    data.documents.forEach((doc) => set.add(doc.fileType));
    return Array.from(set).sort();
  }, [data]);

  // Apply filter → search → sort. Sort is stable (compareDocs returns 0 for
  // ties; Array.prototype.sort is stable in modern JS).
  const displayedDocs = useMemo(() => {
    if (!data) return [];
    let docs = data.documents;
    if (typeFilter !== TYPE_FILTER_ALL) {
      docs = docs.filter((doc) => doc.fileType === typeFilter);
    }
    const search = debouncedSearch.trim().toLowerCase();
    if (search) {
      docs = docs.filter((doc) => doc.fileName.toLowerCase().includes(search));
    }
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...docs].sort((a, b) => direction * compareDocs(a, b, sort.column));
  }, [data, typeFilter, debouncedSearch, sort]);

  const handleSelect = useCallback(
    (documentId: string) => {
      onDocumentSelect(documentId);
      emitEvent({ type: 'document/selected', documentSetId, documentId, folderId });
    },
    [onDocumentSelect, emitEvent, documentSetId, folderId],
  );

  const handleSortChange = useCallback((column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: column === 'updated' || column === 'size' ? 'desc' : 'asc' },
    );
  }, []);

  const handleToggleBulkSelect = useCallback((documentId: string) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }, []);

  // Header checkbox: select all visible rows. Clicking again with all selected
  // clears the selection. Indeterminate when partially selected.
  const visibleIds = useMemo(
    () => displayedDocs.map((doc) => doc.documentId),
    [displayedDocs],
  );
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => bulkSelection.has(id)).length,
    [visibleIds, bulkSelection],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleHeaderCheckbox = useCallback(() => {
    setBulkSelection((prev) => {
      if (allVisibleSelected) {
        // Clear selection of currently-visible rows; preserve any selection
        // outside the current filter.
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allVisibleSelected, visibleIds]);

  const handleSingleDeleteRequest = useCallback((doc: DocumentMetadataResponse) => {
    setPendingDelete([doc]);
  }, []);

  const handleBulkDeleteRequest = () => {
    if (!data) return;
    const docs = data.documents.filter((doc) => bulkSelection.has(doc.documentId));
    if (docs.length === 0) return;
    setPendingDelete(docs);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete || pendingDelete.length === 0) return;
    const docs = pendingDelete;
    setPendingDelete(null);

    if (docs.length === 1) {
      const { documentId, fileName } = docs[0];
      deleteMutation.mutate(
        { documentSetId, documentId, folderId },
        {
          onSuccess: () => {
            if (selectedDocumentId === documentId) onDocumentSelect(null);
            setBulkSelection((prev) => {
              if (!prev.has(documentId)) return prev;
              const next = new Set(prev);
              next.delete(documentId);
              return next;
            });
          },
          onError: (error) =>
            pushToast((error as Error).message ?? `Could not delete ${fileName}.`, 'error'),
        },
      );
      return;
    }

    // Bulk path: serialise so failures surface in order and we don't blast the
    // API. Track per-doc outcomes so we can report a partial-failure summary.
    setIsBulkDeleting(true);
    let successCount = 0;
    const failures: string[] = [];
    for (const doc of docs) {
      try {
        await deleteMutation.mutateAsync({
          documentSetId,
          documentId: doc.documentId,
          folderId,
        });
        if (selectedDocumentId === doc.documentId) onDocumentSelect(null);
        successCount++;
      } catch {
        failures.push(doc.fileName);
      }
    }
    setIsBulkDeleting(false);
    setBulkSelection((prev) => {
      const next = new Set(prev);
      docs.forEach((doc) => next.delete(doc.documentId));
      return next;
    });
    if (failures.length === 0) {
      pushToast(`Deleted ${successCount} document${successCount === 1 ? '' : 's'}.`, 'success');
    } else if (successCount === 0) {
      pushToast(`Could not delete documents.`, 'error');
    } else {
      pushToast(
        `Deleted ${successCount} of ${docs.length}. ${failures.length} failed.`,
        'error',
      );
    }
  };

  const selectedDoc = data?.documents.find((doc) => doc.documentId === selectedDocumentId) ?? null;
  const showPanel = selectedDocumentId !== null;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className={styles.skeletonArea}>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      );
    }

    if (isError || !data) {
      return (
        <p className={styles.errorMsg} role="alert">
          Could not load documents.
        </p>
      );
    }

    if (data.documents.length === 0) {
      return (
        <EmptyState
          title="No documents here"
          body={isReadOnly ? '' : 'Upload documents using the upload button.'}
        />
      );
    }

    return (
      <>
        <div className={styles.toolbar} role="toolbar" aria-label="Document filters">
          <div className={styles.searchWrap}>
            <MagnifyingGlass size={14} aria-hidden className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              aria-label="Filter by name"
              placeholder="Filter by name"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <label className={styles.filterWrap}>
            <span className="sr-only">Filter by type</span>
            <select
              className={styles.filterSelect}
              aria-label="Filter by type"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as FileTypeCode | typeof TYPE_FILTER_ALL)
              }
            >
              <option value={TYPE_FILTER_ALL}>All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          {!isReadOnly && bulkSelection.size > 0 && (
            <div className={styles.bulkActions} role="status" aria-live="polite">
              <span className={styles.bulkCount}>
                {bulkSelection.size} selected
              </span>
              <Button
                variant="secondary"
                size="small"
                onClick={handleBulkDeleteRequest}
                aria-label={`Delete ${bulkSelection.size} selected documents`}
              >
                <Trash size={14} aria-hidden /> Delete
              </Button>
            </div>
          )}
        </div>

        {displayedDocs.length === 0 ? (
          <EmptyState
            title="No files match"
            body="Try a different filter or search term."
          />
        ) : (
          <div className={styles.tableWrapper} ref={tableContainerRef}>
            <table className={styles.table} aria-label="Documents">
              <thead>
                <tr className={styles.headerRow}>
                  {!isReadOnly && (
                    <th
                      className={[styles.headerCell, styles.cellCheckbox].join(' ')}
                      scope="col"
                    >
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        className={styles.checkbox}
                        aria-label={
                          allVisibleSelected ? 'Deselect all visible' : 'Select all visible'
                        }
                        checked={allVisibleSelected}
                        onChange={handleHeaderCheckbox}
                      />
                    </th>
                  )}
                  <SortHeader
                    column="name"
                    label="Name"
                    sort={sort}
                    onSortChange={handleSortChange}
                    className={styles.headerName}
                  />
                  <SortHeader
                    column="status"
                    label="Status"
                    sort={sort}
                    onSortChange={handleSortChange}
                  />
                  <SortHeader
                    column="type"
                    label="Type"
                    sort={sort}
                    onSortChange={handleSortChange}
                    className={styles.cellMeta}
                  />
                  <SortHeader
                    column="size"
                    label="Size"
                    sort={sort}
                    onSortChange={handleSortChange}
                    className={styles.cellMeta}
                  />
                  <SortHeader
                    column="updated"
                    label="Updated"
                    sort={sort}
                    onSortChange={handleSortChange}
                    className={styles.cellMeta}
                  />
                  {!isReadOnly && (
                    <th
                      className={[styles.headerCell, styles.cellActions].join(' ')}
                      scope="col"
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayedDocs.map((doc) => (
                  <DocumentRow
                    key={doc.documentId}
                    doc={doc}
                    isSelected={doc.documentId === selectedDocumentId}
                    isInBulkSelection={bulkSelection.has(doc.documentId)}
                    isHighlighted={doc.documentId === highlightedDocumentId}
                    isReadOnly={isReadOnly}
                    onSelect={handleSelect}
                    onToggleBulkSelect={handleToggleBulkSelect}
                    onDeleteRequest={handleSingleDeleteRequest}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  return (
    <div className={[styles.container, showPanel ? styles.containerWithPanel : ''].filter(Boolean).join(' ')}>
      <div className={styles.listArea}>{renderContent()}</div>

      {showPanel && (
        <div className={styles.panelArea}>
          <DocumentPropertiesPanel
            documentSetId={documentSetId}
            documentId={selectedDocumentId!}
            document={selectedDoc}
            isReadOnly={isReadOnly}
            onClose={() => onDocumentSelect(null)}
            onDeleteRequest={handleSingleDeleteRequest}
          />
        </div>
      )}

      <DeleteDocumentsModal
        isOpen={pendingDelete !== null}
        docs={pendingDelete ?? []}
        isDeleting={deleteMutation.isPending || isBulkDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
