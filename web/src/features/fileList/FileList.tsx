import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentMetadataResponse, DocumentStatus } from '@shared/types';
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
import {
  DND_MIME_DOCUMENT_ID,
  DND_MIME_DOCUMENT_SOURCE_FOLDER,
} from '../../utils/dndMime';
import { SELECTION_CAP_PER_KIND, useSelection } from '../selection';
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
    case 'type': {
      // Sort by classifier-derived documentType, not the coarse fileType
      // code. Nulls (classification skipped or pending) sort last so the
      // user sees populated values first regardless of direction.
      const aType = a.documentType;
      const bType = b.documentType;
      if (aType === null && bType === null) return 0;
      if (aType === null) return 1;
      if (bType === null) return -1;
      return aType.localeCompare(bType, undefined, { sensitivity: 'base' });
    }
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

// Aria-live-friendly summary of the current selection. Pluralized so screen
// readers don't say "1 documents selected".
const selectionSummary = ({
  documents,
  folders,
}: {
  documents: number;
  folders: number;
}): string => {
  if (documents === 0 && folders === 0) return '';
  const parts: string[] = [];
  if (documents > 0) {
    parts.push(`${documents} document${documents === 1 ? '' : 's'}`);
  }
  if (folders > 0) {
    parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  }
  return `${parts.join(', ')} selected`;
};

// ─── Document row ─────────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: DocumentMetadataResponse;
  /** The folder the row is currently rendered in. Encoded into the drag
   *  payload so the document-move mutation can invalidate the source folder's
   *  contents query in addition to the destination. */
  currentFolderId: string | null;
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
  currentFolderId,
  isSelected,
  isInBulkSelection,
  isHighlighted,
  isReadOnly,
  onSelect,
  onToggleBulkSelect,
  onDeleteRequest,
}: DocumentRowProps) => {
  const isReady = doc.status === 'Ready';
  // Only Ready documents are draggable. In-flight rows can't be moved without
  // racing the worker. Read-only callers can't move either.
  const isDraggable = !isReadOnly && isReady;
  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLTableRowElement>) => {
      event.dataTransfer.setData(DND_MIME_DOCUMENT_ID, doc.documentId);
      // Encode the source folder so the drop handler can invalidate its
      // contents query. `__root__` distinguishes the document-set root from
      // an empty string ("not set").
      event.dataTransfer.setData(
        DND_MIME_DOCUMENT_SOURCE_FOLDER,
        currentFolderId ?? '__root__',
      );
      event.dataTransfer.effectAllowed = 'move';
    },
    [doc.documentId, currentFolderId],
  );
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
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
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
      <td className={[styles.cell, styles.cellMeta].join(' ')}>{doc.documentType ?? '—'}</td>
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
  const selection = useSelection();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sort / filter / search state. All client-side; the wire contract returns
  // documents flat per folder. The set of selected document IDs lives in the
  // shared SelectionContext so it survives folder navigation and feeds the
  // `selection/changed` host event the consumer uses to scope chat retrieval.
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [typeFilter, setTypeFilter] = useState<string | typeof TYPE_FILTER_ALL>(
    TYPE_FILTER_ALL,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [pendingDelete, setPendingDelete] = useState<DocumentMetadataResponse[] | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Set view over the shared selection list for O(1) lookups in the row map.
  const selectedDocumentIds = useMemo(
    () => new Set(selection.state.documents.map((doc) => doc.documentId)),
    [selection.state.documents],
  );

  // When a document is revealed via RootShell.revealDocument(), scroll its row
  // into view once the documents query has resolved and the row is in the DOM.
  useEffect(() => {
    if (!highlightedDocumentId || !data) return;
    const row = tableContainerRef.current?.querySelector<HTMLElement>(
      `[data-document-id="${CSS.escape(highlightedDocumentId)}"]`,
    );
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedDocumentId, data]);

  // Distinct document types present in the loaded documents — drives the
  // filter dropdown so we only ever offer types the user can actually find.
  // Nulls (unclassified) are excluded; the user can still see those rows by
  // not narrowing the filter at all.
  const availableTypes = useMemo<string[]>(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.documents.forEach((doc) => {
      if (doc.documentType !== null) set.add(doc.documentType);
    });
    return Array.from(set).sort();
  }, [data]);

  // Apply filter → search → sort. Sort is stable (compareDocs returns 0 for
  // ties; Array.prototype.sort is stable in modern JS).
  const displayedDocs = useMemo(() => {
    if (!data) return [];
    let docs = data.documents;
    if (typeFilter !== TYPE_FILTER_ALL) {
      docs = docs.filter((doc) => doc.documentType === typeFilter);
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

  const handleToggleBulkSelect = useCallback(
    (documentId: string) => {
      const doc = data?.documents.find((row) => row.documentId === documentId);
      if (!doc) return;
      const outcome = selection.toggleDocument({
        documentId: doc.documentId,
        fileName: doc.fileName,
      });
      if (outcome === 'cap-reached') {
        pushToast(
          `Selection limit reached — at most ${SELECTION_CAP_PER_KIND} documents can be selected at once.`,
          'info',
        );
      }
    },
    [data, selection, pushToast],
  );

  // Header checkbox: select all visible rows. Clicking again with all selected
  // clears the selection of visible rows (selection of rows outside the
  // current filter is preserved). Indeterminate when partially selected.
  const visibleDocs = useMemo(() => displayedDocs, [displayedDocs]);
  const visibleIds = useMemo(
    () => visibleDocs.map((doc) => doc.documentId),
    [visibleDocs],
  );
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selectedDocumentIds.has(id)).length,
    [visibleIds, selectedDocumentIds],
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
    const next = allVisibleSelected
      ? []
      : visibleDocs.map((doc) => ({
          documentId: doc.documentId,
          fileName: doc.fileName,
        }));
    const report = selection.setVisibleDocuments(visibleIds, next);
    if (report.capReached) {
      pushToast(
        `Selection limit reached — at most ${SELECTION_CAP_PER_KIND} documents can be selected at once.`,
        'info',
      );
    }
  }, [allVisibleSelected, visibleDocs, visibleIds, selection, pushToast]);

  const handleSingleDeleteRequest = useCallback((doc: DocumentMetadataResponse) => {
    setPendingDelete([doc]);
  }, []);

  const handleBulkDeleteRequest = () => {
    if (!data) return;
    const docs = data.documents.filter((doc) =>
      selectedDocumentIds.has(doc.documentId),
    );
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
            // Drop the deleted doc from the shared selection.
            if (selectedDocumentIds.has(documentId)) {
              selection.toggleDocument({ documentId, fileName });
            }
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
    const deletedIds: string[] = [];
    for (const doc of docs) {
      try {
        await deleteMutation.mutateAsync({
          documentSetId,
          documentId: doc.documentId,
          folderId,
        });
        if (selectedDocumentId === doc.documentId) onDocumentSelect(null);
        successCount++;
        deletedIds.push(doc.documentId);
      } catch {
        failures.push(doc.fileName);
      }
    }
    setIsBulkDeleting(false);
    // Remove successfully-deleted rows from the shared selection. Use
    // setVisibleDocuments with the deleted IDs as the "visible" universe so
    // it strips exactly those and preserves the rest of the selection.
    if (deletedIds.length > 0) {
      selection.setVisibleDocuments(deletedIds, []);
    }
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
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value={TYPE_FILTER_ALL}>All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          {!isReadOnly &&
            (selectedDocumentIds.size > 0 || selection.state.folders.length > 0) && (
              <div className={styles.bulkActions} role="status" aria-live="polite" aria-atomic="true">
                <span className={styles.bulkCount}>
                  {selectionSummary({
                    documents: selectedDocumentIds.size,
                    folders: selection.state.folders.length,
                  })}
                </span>
                {selectedDocumentIds.size > 0 && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleBulkDeleteRequest}
                    aria-label={`Delete ${selectedDocumentIds.size} selected documents`}
                  >
                    <Trash size={14} aria-hidden /> Delete
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="small"
                  onClick={selection.clear}
                  aria-label="Clear selection"
                >
                  Clear
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
                    currentFolderId={folderId}
                    isSelected={doc.documentId === selectedDocumentId}
                    isInBulkSelection={selectedDocumentIds.has(doc.documentId)}
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
