import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { List } from '@phosphor-icons/react';
import type { IndexerHandle } from '@shared/types';
import { CollectionsSidebar } from '../features/collections/CollectionsSidebar';
import { useActiveDocumentSet } from '../features/collections/state';
import { FolderTree } from '../features/folders';
import type { FolderTreeHandle } from '../features/folders';
import { FileList } from '../features/fileList';
import {
  FailedFilesPopover,
  UploadDropzone,
  UploadProgressBanner,
  computeFolderAggregates,
  useBeforeUnloadGuard,
  useUploadController,
  useUploadState,
} from '../features/upload';
import { ToastViewport } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { getDocumentMetadata } from '../api/endpoints/documents';
import { useApiClient } from '../hooks/useApiClient';
import { useKeyboardEscape } from '../hooks/useKeyboardEscape';
import { isHydrateAction, usePersistedReducer } from '../hooks/usePersistedReducer';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../hooks/useToast';
import styles from './RootShell.module.css';

// Static id for aria-controls / element targeting from the mobile hamburger.
const SIDEBAR_DOM_ID = 'indexer-collections-sidebar';

// Top-level layout: collections sidebar, folder tree pane, file list pane.
// Folder/document selection state lives here so revealDocument can set both.

// How long the row revealed via revealDocument() stays highlighted before
// fading back to its normal state. Long enough to draw the eye, short enough
// not to feel sticky.
const HIGHLIGHT_DURATION_MS = 8000;

interface SidebarState {
  collapsed: boolean;
}

type SidebarAction =
  | { type: 'TOGGLE' }
  | { type: '@@persistedReducer/HYDRATE'; payload: unknown };

const sidebarReducer = (state: SidebarState, action: SidebarAction): SidebarState => {
  if (isHydrateAction(action)) {
    const payload = action.payload as Partial<SidebarState> | undefined;
    return { ...state, ...(payload ?? {}) };
  }
  switch (action.type) {
    case 'TOGGLE':
      return { collapsed: !state.collapsed };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
};

export const RootShell = forwardRef<IndexerHandle>((_props, ref) => {
  const { documentSetId, accessRole, select } = useActiveDocumentSet();
  const [sidebarState, dispatchSidebar] = usePersistedReducer(
    sidebarReducer,
    { collapsed: false },
    { store: 'ui', key: 'sidebar' },
  );
  const { mode, toggleMode } = useTheme();
  const client = useApiClient();
  const toast = useToast();

  // Upload controller — drives the active session for the current collection.
  const uploadController = useUploadController(documentSetId);
  const uploadState = useUploadState();

  // Folder and document selection — live in RootShell so revealDocument can set both.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  // Transient highlight applied to a row revealed via revealDocument(). Cleared
  // after HIGHLIGHT_DURATION_MS so the row fades back to its normal state.
  const [highlightedDocumentId, setHighlightedDocumentId] = useState<string | null>(null);
  const folderTreeRef = useRef<FolderTreeHandle>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [failurePopoverFolderId, setFailurePopoverFolderId] = useState<
    string | null | undefined
  >(undefined);

  // Mobile sidebar overlay state. Ephemeral — does not persist across reloads.
  // Above the mobile breakpoint the sidebar is always in flow and this flag
  // is a no-op visually; it still drives aria-expanded on the hamburger so
  // assistive tech sees a consistent state.
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleMobileSidebar = useCallback(
    () => setMobileSidebarOpen((prev) => !prev),
    [],
  );
  useKeyboardEscape(isMobileSidebarOpen, closeMobileSidebar);

  // Reset folder/document selection whenever the active collection changes.
  // Also auto-dismiss the mobile overlay so picking a collection on mobile
  // returns the user to the main pane immediately.
  useEffect(() => {
    setActiveFolderId(null);
    setSelectedDocumentId(null);
    setHighlightedDocumentId(null);
    setFailurePopoverFolderId(undefined);
    setMobileSidebarOpen(false);
  }, [documentSetId]);

  // Clear any pending highlight timer on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Browser-close guard while a batch is in flight (spec 3.5.4).
  useBeforeUnloadGuard(uploadController.isInFlight);

  // Per-folder aggregate map, scoped to the active collection's session.
  // Computed only when there's actually session work — avoids a stale map
  // surviving after the user clears the banner.
  const folderAggregates = useMemo(() => {
    if (uploadState.targetDocumentSetId !== documentSetId) return undefined;
    if (uploadState.files.length === 0) return undefined;
    return computeFolderAggregates(uploadState.files);
  }, [uploadState.files, uploadState.targetDocumentSetId, documentSetId]);

  const isReadOnly = accessRole === 'Shared';
  const sessionMatchesCurrent =
    uploadState.targetDocumentSetId === documentSetId && uploadState.files.length > 0;

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setActiveFolderId(folderId);
    setSelectedDocumentId(null);
  }, []);

  const onToggleSidebar = useCallback(() => {
    dispatchSidebar({ type: 'TOGGLE' });
  }, [dispatchSidebar]);

  const handleAcceptDrop = useCallback(
    async (input: { dataTransfer?: DataTransfer; fileList?: FileList | null }) => {
      if (!documentSetId) return;
      if (isReadOnly) {
        toast.push('You can view but not upload to this collection.', 'info');
        return;
      }
      try {
        await uploadController.acceptDrop(input, { rootFolderId: activeFolderId });
      } catch {
        toast.push('Could not start upload. Please try again.', 'error');
      }
    },
    [documentSetId, isReadOnly, uploadController, activeFolderId, toast],
  );

  const handleJumpToSourceCollection = useCallback(() => {
    if (uploadState.targetDocumentSetId) {
      select(uploadState.targetDocumentSetId);
    }
  }, [select, uploadState.targetDocumentSetId]);

  const handleFailureBadgeClick = useCallback((folderId: string | null) => {
    setFailurePopoverFolderId(folderId);
  }, []);

  const failures = useMemo(() => {
    if (failurePopoverFolderId === undefined) return [];
    return uploadState.files.filter(
      (file) =>
        (file.targetFolderId ?? null) === failurePopoverFolderId &&
        (file.status === 'Failed' ||
          file.status === 'Unsupported' ||
          file.status === 'Duplicate'),
    );
  }, [failurePopoverFolderId, uploadState.files]);

  useImperativeHandle(
    ref,
    () => ({
      selectCollection: (id: string | null) => select(id),
      revealDocument: async (documentId: string) => {
        if (!documentSetId) return;
        try {
          const doc = await getDocumentMetadata(client, documentId);
          // Defensive: ignore documents from other collections — caller
          // mistake or stale ID; do not corrupt our local state.
          if (doc.documentSetId !== documentSetId) return;

          if (doc.folderId) {
            setActiveFolderId(doc.folderId);
            folderTreeRef.current?.revealFolder(doc.folderId);
          } else {
            setActiveFolderId(null);
          }
          setSelectedDocumentId(documentId);

          // Trigger transient highlight; FileList scrolls the row into view
          // when this prop changes.
          if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
          setHighlightedDocumentId(documentId);
          highlightTimerRef.current = setTimeout(() => {
            setHighlightedDocumentId(null);
          }, HIGHLIGHT_DURATION_MS);
        } catch {
          // App Insights wiring is deferred to a follow-on slice; until then
          // we surface the failure only by leaving the UI unchanged.
        }
      },
    }),
    [select, client, documentSetId],
  );

  const themeLabel = useMemo(() => (mode === 'dark' ? 'Light mode' : 'Dark mode'), [mode]);
  const themeAriaLabel = useMemo(
    () => (mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'),
    [mode],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.hamburger}
          onClick={toggleMobileSidebar}
          aria-label={isMobileSidebarOpen ? 'Close collections menu' : 'Open collections menu'}
          aria-expanded={isMobileSidebarOpen}
          aria-controls={SIDEBAR_DOM_ID}
        >
          <List size={20} aria-hidden />
        </button>
        <div className={styles.brand}>
          <h1 className={styles.brandTitle}>Reusable Indexer</h1>
          <span className={styles.brandSubtitle}>Document collections</span>
        </div>
        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggleMode}
          aria-label={themeAriaLabel}
        >
          {themeLabel}
        </button>
      </header>

      <div className={styles.body}>
        <div
          id={SIDEBAR_DOM_ID}
          className={[
            styles.sidebarSlot,
            isMobileSidebarOpen ? styles.sidebarSlotMobileOpen : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <CollectionsSidebar
            collapsed={sidebarState.collapsed}
            onToggleCollapse={onToggleSidebar}
            uploadInProgress={uploadController.isInFlight}
            onAfterCollectionSelect={closeMobileSidebar}
          />
        </div>

        {isMobileSidebarOpen && (
          <button
            type="button"
            className={styles.mobileBackdrop}
            onClick={closeMobileSidebar}
            // Distinct label from the hamburger so assistive tech surfaces
            // two queryable controls instead of two ambiguous "close" buttons.
            aria-label="Dismiss collections menu"
          />
        )}

        <main className={styles.main} aria-label="Active collection">
          {documentSetId ? (
            // key forces tree + list to remount on collection switch so IndexedDB
            // persisted state (expanded folders) is cleanly re-hydrated per collection.
            <div key={documentSetId} className={styles.collectionArea}>
              <UploadDropzone disabled={isReadOnly} onDrop={handleAcceptDrop}>
                <div className={styles.collectionInner}>
                  <div className={styles.folderPane}>
                    <FolderTree
                      ref={folderTreeRef}
                      documentSetId={documentSetId}
                      activeFolderId={activeFolderId}
                      onFolderSelect={handleFolderSelect}
                      isReadOnly={isReadOnly}
                      aggregateStatuses={folderAggregates}
                      onFailureBadgeClick={handleFailureBadgeClick}
                    />
                  </div>
                  <div className={styles.contentPane}>
                    <FileList
                      documentSetId={documentSetId}
                      folderId={activeFolderId}
                      selectedDocumentId={selectedDocumentId}
                      onDocumentSelect={setSelectedDocumentId}
                      isReadOnly={isReadOnly}
                      highlightedDocumentId={highlightedDocumentId}
                    />
                  </div>
                </div>
              </UploadDropzone>
            </div>
          ) : (
            <div className={styles.placeholder}>
              <EmptyState
                title="Select a collection"
                body="Pick a collection from the sidebar, or create a new one to get started."
              />
            </div>
          )}
        </main>
      </div>

      {failurePopoverFolderId !== undefined && (
        <div className={styles.popoverAnchor} role="presentation">
          <FailedFilesPopover
            folderName={
              failurePopoverFolderId === null
                ? 'All files'
                : (failurePopoverFolderId ?? '')
            }
            failures={failures}
            onClose={() => setFailurePopoverFolderId(undefined)}
            onRetry={uploadController.retry}
            onDismiss={uploadController.dismiss}
            onRetryAll={uploadController.retryAll}
            onDismissAll={uploadController.dismissFailures}
          />
        </div>
      )}

      {sessionMatchesCurrent || uploadState.files.length > 0 ? (
        <UploadProgressBanner
          controller={uploadController}
          isViewingSource={
            uploadState.targetDocumentSetId === documentSetId
          }
          onJumpToSourceCollection={handleJumpToSourceCollection}
        />
      ) : null}

      <ToastViewport />
    </div>
  );
});

RootShell.displayName = 'RootShell';
