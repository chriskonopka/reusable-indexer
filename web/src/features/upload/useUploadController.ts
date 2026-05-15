import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  BatchStatusResponse,
  FolderTreeResponse,
  UploadFile,
} from '@shared/types';
import { useApiClient } from '../../hooks/useApiClient';
import { usePolling } from '../../hooks/usePolling';
import { useToast } from '../../hooks/useToast';
import { ApiClientError } from '../../api/client';
import {
  completeBatch,
  createBatch,
  getBatchStatus,
  uploadDocument,
} from '../../api/endpoints/batches';
import { createFolder } from '../../api/endpoints/folders';
import { queryKeys } from '../../api/queryKeys';
import { classify, type FileTypeClassification } from '../../utils/fileTypeFilter';
import { isJunkFile } from '../../utils/junkFileFilter';
import { resolveTargetFolderId } from '../../utils/folderPath';
import {
  isStatusTerminal,
  mapWireStatus,
} from './aggregates';
import {
  DroppedFile,
  fromFileList,
  walkDataTransfer,
} from './folderEntryWalk';
import {
  isUploadFinished,
  isUploadInFlight,
  useUploadDispatch,
  useUploadState,
} from './state';

// Concurrency cap for `POST /documents`. Default per
// document-pipeline/web-document-upload.md §"Sliding window of 5".
const CONCURRENT_UPLOADS = 5;

// Polling cadence for `POST /batches/{id}/status`. The contract says
// "every few seconds" without a fixed value; we pin 2 s here per the
// Step 1 architecture decision.
const POLLING_INTERVAL_MS = 2000;

// Time the green "Indexed" badge stays visible before fading from the
// session view. Matches the per-row fade in spec 3.5.1.
const INDEXED_FADE_MS = 8000;

interface SubmissionInputs {
  /** From a drag-drop event. */
  dataTransfer?: DataTransfer;
  /** From a file/folder picker. */
  fileList?: FileList | null;
}

interface AcceptOptions {
  /** Folder the user dropped into. `null` = collection root. Spec 3.4.6. */
  rootFolderId: string | null;
}

export interface UploadController {
  /** True while a batch is in flight (Pending / InProgress). */
  isInFlight: boolean;
  /** Accept files from a drag-drop event or a picker FileList. */
  acceptDrop: (input: SubmissionInputs, options: AcceptOptions) => Promise<void>;
  /** Drop a single row from the session view. Does not unsend it. */
  dismiss: (clientId: string) => void;
  /** Drop every failed/skipped/duplicate row. */
  dismissFailures: () => void;
  /** Toggle the bottom progress banner expanded/collapsed. */
  toggleBanner: () => void;
  /** Force the banner expanded/collapsed. */
  setBannerExpanded: (expanded: boolean) => void;
  /** Clear the entire session (called when navigating to fresh upload). */
  clear: () => void;
}

const newClientId = (): string => crypto.randomUUID();

const buildUploadFile = (
  drop: DroppedFile,
  classification: FileTypeClassification,
  targetFolderId: string | null,
): UploadFile => {
  if (classification.kind !== 'supported') {
    const status =
      classification.kind === 'unsupported'
        ? 'Unsupported'
        : 'Failed';
    return {
      clientId: newClientId(),
      file: drop.file,
      relativePath: drop.relativePath,
      targetFolderId,
      status,
      documentId: null,
      failureReason: classification.reason,
      severity: status === 'Unsupported' ? 'Skip' : 'Fail',
      retryable: false,
    };
  }
  return {
    clientId: newClientId(),
    file: drop.file,
    relativePath: drop.relativePath,
    targetFolderId,
    status: 'Queued',
    documentId: null,
    failureReason: null,
    severity: null,
    retryable: false,
  };
};

const isApiError = (error: unknown): error is ApiClientError =>
  error instanceof ApiClientError;

const failureFromApi = (
  error: ApiClientError,
): {
  failureReason: string;
  retryable: boolean;
  status: UploadFile['status'];
  severity: UploadFile['severity'];
} => {
  const slug = error.normalized.type.split('/').pop() ?? '';
  if (slug === 'unsupported-content-type') {
    return {
      failureReason: error.normalized.detail,
      retryable: false,
      status: 'Unsupported',
      severity: 'Skip',
    };
  }
  if (slug === 'duplicate-filename') {
    return {
      failureReason: error.normalized.detail,
      retryable: false,
      status: 'Duplicate',
      severity: 'Skip',
    };
  }
  if (slug === 'document-too-large') {
    return {
      failureReason: error.normalized.detail,
      retryable: false,
      status: 'Failed',
      severity: 'Fail',
    };
  }
  // Network, 5xx, or transient (blob-unavailable) — retryable.
  const transient =
    error.normalized.status === 0 ||
    error.normalized.status >= 500 ||
    slug === 'blob-unavailable';
  return {
    failureReason: error.normalized.detail,
    retryable: transient,
    status: 'Failed',
    severity: 'Fail',
  };
};

export const useUploadController = (
  documentSetId: string | null,
): UploadController => {
  const state = useUploadState();
  const dispatch = useUploadDispatch();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  // The collection the in-flight batch was started in. Different from the
  // `documentSetId` hook arg, which tracks the currently active collection.
  // Allowing navigation between collections during an upload (rather than
  // freezing the sidebar — see CollectionsSidebar) means the pump / poll /
  // /complete / cache invalidation must all stay pinned to the upload's home,
  // not the user's current view.
  const uploadDocumentSetId = state.targetDocumentSetId || null;

  // The set of clientIds currently uploading — bounds concurrency without
  // touching React state on every dispatch.
  const inFlightRef = useRef<Set<string>>(new Set());
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep a ref to the latest state so callbacks captured in pump loops
  // don't drift after a dispatch.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------------------------------------------------------------------------
  // Folder resolution shared with the controller's pump loop.
  // ---------------------------------------------------------------------------

  const ensureBatchId = useCallback(async (): Promise<string | null> => {
    if (!uploadDocumentSetId) return null;
    if (stateRef.current.batchId) return stateRef.current.batchId;
    try {
      const batch = await createBatch(client, uploadDocumentSetId);
      dispatch({ type: 'SET_BATCH_ID', batchId: batch.batchId });
      return batch.batchId;
    } catch {
      // The pump loop marks affected files Failed individually.
      return null;
    }
  }, [client, dispatch, uploadDocumentSetId]);

  // ---------------------------------------------------------------------------
  // Core upload pump — sliding window of CONCURRENT_UPLOADS.
  // ---------------------------------------------------------------------------

  const uploadOne = useCallback(
    async (file: UploadFile, batchId: string) => {
      if (!uploadDocumentSetId) return;
      inFlightRef.current.add(file.clientId);
      dispatch({
        type: 'PATCH_FILE',
        clientId: file.clientId,
        patch: { status: 'Uploading' },
      });
      const classification = classify({
        name: file.file.name,
        type: file.file.type,
        size: file.file.size,
      });
      if (classification.kind !== 'supported') {
        // Should not happen — file was already gated client-side. Defensive.
        dispatch({
          type: 'PATCH_FILE',
          clientId: file.clientId,
          patch: {
            status:
              classification.kind === 'unsupported' ? 'Unsupported' : 'Failed',
            failureReason: classification.reason,
            severity: classification.kind === 'unsupported' ? 'Skip' : 'Fail',
            retryable: false,
          },
        });
        inFlightRef.current.delete(file.clientId);
        return;
      }
      try {
        const accepted = await uploadDocument(client, {
          documentSetId: uploadDocumentSetId,
          batchId,
          folderId: file.targetFolderId,
          fileType: classification.fileTypeCode,
          file: file.file,
        });
        dispatch({
          type: 'PATCH_FILE',
          clientId: file.clientId,
          patch: {
            status: 'Submitted',
            documentId: accepted.documentId,
            failureReason: null,
            severity: null,
          },
        });
      } catch (error) {
        if (isApiError(error)) {
          const mapped = failureFromApi(error);
          dispatch({
            type: 'PATCH_FILE',
            clientId: file.clientId,
            patch: {
              status: mapped.status,
              failureReason: mapped.failureReason,
              severity: mapped.severity,
              retryable: mapped.retryable,
            },
          });
        } else {
          dispatch({
            type: 'PATCH_FILE',
            clientId: file.clientId,
            patch: {
              status: 'Failed',
              failureReason: 'Could not upload — please try again.',
              severity: 'Fail',
              retryable: true,
            },
          });
        }
      } finally {
        inFlightRef.current.delete(file.clientId);
      }
    },
    [client, dispatch, uploadDocumentSetId],
  );

  // The pump runs whenever the queue or the in-flight set changes. It picks
  // up to CONCURRENT_UPLOADS files and starts each one as a fire-and-forget
  // promise; `inFlightRef` keeps it from launching the same file twice.
  useEffect(() => {
    if (!uploadDocumentSetId) return;
    const queue = state.files.filter((file) => file.status === 'Queued');
    if (queue.length === 0) return;
    const free = CONCURRENT_UPLOADS - inFlightRef.current.size;
    if (free <= 0) return;
    const slice = queue.slice(0, free);
    void (async () => {
      const batchId = await ensureBatchId();
      if (!batchId) {
        // Mark every queued file Failed if the batch couldn't be created.
        dispatch({
          type: 'PATCH_FILES',
          entries: state.files
            .filter((file) => file.status === 'Queued')
            .map((file) => ({
              clientId: file.clientId,
              patch: {
                status: 'Failed' as const,
                failureReason: 'Could not start upload batch.',
                severity: 'Fail' as const,
                retryable: true,
              },
            })),
        });
        return;
      }
      slice.forEach((file) => {
        if (inFlightRef.current.has(file.clientId)) return;
        void uploadOne(file, batchId);
      });
    })();
  }, [state.files, uploadDocumentSetId, dispatch, ensureBatchId, uploadOne]);

  // ---------------------------------------------------------------------------
  // /complete signal — fired once after every file leaves the upload phase.
  // ---------------------------------------------------------------------------

  const completeFiredRef = useRef<string | null>(null);
  const completeInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uploadDocumentSetId || !state.batchId) return;
    if (state.files.length === 0) return;
    if (completeFiredRef.current === state.batchId) return;
    if (completeInFlightRef.current === state.batchId) return;
    const stillUploading = state.files.some(
      (file) => file.status === 'Queued' || file.status === 'Uploading',
    );
    if (stillUploading) return;
    const anySubmitted = state.files.some(
      (file) =>
        file.status === 'Submitted' ||
        file.status === 'Indexing' ||
        file.status === 'Indexed',
    );
    if (!anySubmitted) return;

    // Capture the batchId we're targeting so it can't drift if state changes
    // mid-flight. The latch (`completeFiredRef`) is set ONLY on success — a
    // transient HTTP failure (network blip, 502 from AFD, etc.) leaves the
    // latch open so the next state mutation re-fires this effect and retries.
    // The in-flight ref prevents duplicate concurrent /complete calls.
    const targetBatchId = state.batchId;
    completeInFlightRef.current = targetBatchId;
    void (async () => {
      try {
        await completeBatch(client, uploadDocumentSetId, targetBatchId);
        completeFiredRef.current = targetBatchId;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          '[indexer] /complete failed; will retry on next state change',
          { documentSetId: uploadDocumentSetId, batchId: targetBatchId, error },
        );
      } finally {
        if (completeInFlightRef.current === targetBatchId) {
          completeInFlightRef.current = null;
        }
      }
    })();
  }, [client, uploadDocumentSetId, state.batchId, state.files]);

  // ---------------------------------------------------------------------------
  // Status polling — pauses when no documents are awaiting indexing.
  // ---------------------------------------------------------------------------

  const indexedFadeRef = useRef<typeof fadeTimersRef.current>(fadeTimersRef.current);

  const reconcileStatus = useCallback(
    (response: BatchStatusResponse) => {
      const wireById = new Map(
        response.documents.map((row) => [row.documentId, row]),
      );
      const entries = stateRef.current.files
        .filter((file) => file.documentId !== null)
        .map((file) => {
          const wire = wireById.get(file.documentId!);
          if (!wire) return null;
          const nextStatus = mapWireStatus(wire.status);
          if (nextStatus === file.status && wire.failureReason === file.failureReason) {
            return null;
          }
          const patch: Partial<UploadFile> = {
            status: nextStatus,
            failureReason: wire.failureReason,
            severity: nextStatus === 'Failed' ? 'Fail' : null,
            retryable: false,
          };
          return { clientId: file.clientId, patch };
        })
        .filter((entry): entry is { clientId: string; patch: Partial<UploadFile> } => entry !== null);

      if (entries.length > 0) {
        dispatch({ type: 'PATCH_FILES', entries });
      }

      // After reconcile, sync the aggregate.
      const aggregate = response.status;
      if (aggregate !== stateRef.current.aggregateStatus) {
        dispatch({ type: 'SET_AGGREGATE', status: aggregate });
      }

      // When the batch completes, invalidate document-set caches so other
      // features (folder tree counts, file list) refresh.
      if (
        aggregate === 'Completed' ||
        aggregate === 'CompletedWithErrors'
      ) {
        if (uploadDocumentSetId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.folders.tree(uploadDocumentSetId),
          });
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'folders' && query.queryKey[1] === 'contents',
          });
        }
      }
    },
    [dispatch, uploadDocumentSetId, queryClient],
  );

  const pollOnce = useCallback(async () => {
    if (!uploadDocumentSetId || !state.batchId) return;
    try {
      const response = await getBatchStatus(client, uploadDocumentSetId, state.batchId);
      reconcileStatus(response);
    } catch {
      // Polling failures are surfaced through the normal banner state on
      // the next successful tick — no need to mutate state here.
    }
  }, [client, uploadDocumentSetId, state.batchId, reconcileStatus]);

  // Per web-document-upload.md §5, poll until the server's aggregate status is
  // terminal. Previously this gated on whether any client-side file was still
  // Submitted/Indexing — but the client can observe every file as Indexed on
  // the poll *before* the server flips the aggregate to Completed. When that
  // happens the polling loop stops, the invalidation guard inside
  // reconcileStatus (which keys off aggregate, not file status) never fires,
  // and the folder tree / file list stay stale until the user manually
  // navigates.
  const anySubmittedYet = state.files.some((file) => file.documentId !== null);

  usePolling(pollOnce, {
    intervalMs: POLLING_INTERVAL_MS,
    enabled:
      uploadDocumentSetId !== null &&
      state.batchId !== null &&
      anySubmittedYet &&
      isUploadInFlight(state.aggregateStatus),
    pauseOnHidden: true,
  });

  // ---------------------------------------------------------------------------
  // Indexed-fade timers — drop "Indexed" rows from the session view 8 s after
  // they appear so a long-running session doesn't accumulate.
  //
  // Gated on a terminal batch status: fading mid-batch made the progress
  // banner read "Indexed 1 of 1 / 0 of 0 / Indexed 1 of 1 …" as each row
  // dropped out of the totals while peers were still indexing. We now only
  // fade once the batch is Completed / CompletedWithErrors, so the totals
  // stay accurate throughout the session.
  // ---------------------------------------------------------------------------

  const batchIsTerminal = isUploadFinished(state.aggregateStatus);

  useEffect(() => {
    const timers = indexedFadeRef.current;
    if (!batchIsTerminal) {
      // Cancel any timers armed during a previous terminal state — the user
      // may have started a follow-up batch before the fade fired.
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
      return;
    }
    for (const file of state.files) {
      if (file.status === 'Indexed' && !timers.has(file.clientId)) {
        const handle = setTimeout(() => {
          timers.delete(file.clientId);
          dispatch({ type: 'DISMISS_FILE', clientId: file.clientId });
        }, INDEXED_FADE_MS);
        timers.set(file.clientId, handle);
      } else if (file.status !== 'Indexed' && timers.has(file.clientId)) {
        const handle = timers.get(file.clientId);
        if (handle) clearTimeout(handle);
        timers.delete(file.clientId);
      }
    }
  }, [state.files, dispatch, batchIsTerminal]);

  // Clear all fade timers on unmount.
  useEffect(() => {
    const timers = indexedFadeRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived flag — exposed to RootShell to drive the collection-switch guard
  // and the browser-close guard.
  // ---------------------------------------------------------------------------

  const hasUnfinishedWork = state.files.some(
    (file) => !isStatusTerminal(file.status),
  );

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  const acceptDrop = useCallback(
    async (input: SubmissionInputs, options: AcceptOptions) => {
      if (!documentSetId) return;

      // One in-flight upload at a time. Allowing the user to browse other
      // collections during an upload (slice #3) means we have to refuse a
      // second drop targeting a different collection — otherwise
      // START_SESSION below would wipe the in-flight session's state.
      const existingTarget = stateRef.current.targetDocumentSetId;
      if (
        existingTarget &&
        existingTarget !== documentSetId &&
        isUploadInFlight(stateRef.current.aggregateStatus)
      ) {
        toast.push(
          'Upload in progress — finish before starting another in a different collection.',
          'info',
        );
        return;
      }

      let dropped: DroppedFile[] = [];
      if (input.dataTransfer) {
        dropped = await walkDataTransfer(input.dataTransfer);
      } else if (input.fileList) {
        dropped = fromFileList(input.fileList);
      }
      // Drop junk silently per spec 3.4.3.
      dropped = dropped.filter((entry) => !isJunkFile(entry.file));
      if (dropped.length === 0) return;

      // Resolve target folders by walking each path once. We share the
      // mutable tree across iterations so sibling files reuse newly-created
      // intermediate folders.
      const treeResponse = queryClient.getQueryData<FolderTreeResponse>(
        queryKeys.folders.tree(documentSetId),
      );
      const tree = treeResponse?.roots
        ? JSON.parse(JSON.stringify(treeResponse.roots)) // deep-clone — we mutate
        : [];

      const accepted: UploadFile[] = [];
      for (const drop of dropped) {
        const classification = classify({
          name: drop.file.name,
          type: drop.file.type,
          size: drop.file.size,
        });
        let folderId: string | null = options.rootFolderId;
        if (classification.kind === 'supported') {
          try {
            folderId = await resolveTargetFolderId({
              relativePath: drop.relativePath,
              rootFolderId: options.rootFolderId,
              tree,
              createMissing: async (parentId, name) => {
                const created = await createFolder(client, documentSetId, {
                  name,
                  parentFolderId: parentId,
                });
                return created.folderId;
              },
            });
          } catch {
            // Folder couldn't be resolved — surface as Failed (retryable).
            accepted.push({
              clientId: newClientId(),
              file: drop.file,
              relativePath: drop.relativePath,
              targetFolderId: options.rootFolderId,
              status: 'Failed',
              documentId: null,
              failureReason: 'Could not create destination folder.',
              severity: 'Fail',
              retryable: true,
            });
            continue;
          }
        }
        accepted.push(buildUploadFile(drop, classification, folderId));
      }

      // Refresh the folder tree if any folders were created during walk.
      const createdFolders = JSON.stringify(tree) !== JSON.stringify(treeResponse?.roots ?? []);
      if (createdFolders) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.folders.tree(documentSetId),
        });
      }

      const sessionMatchesCollection =
        stateRef.current.targetDocumentSetId === documentSetId &&
        stateRef.current.files.length > 0;
      if (sessionMatchesCollection) {
        dispatch({ type: 'APPEND_FILES', files: accepted });
      } else {
        dispatch({
          type: 'START_SESSION',
          targetDocumentSetId: documentSetId,
          files: accepted,
        });
      }
      // Re-arm the /complete trigger for the (possibly new) batch.
      completeFiredRef.current = null;
    },
    [client, dispatch, documentSetId, queryClient, toast],
  );


  const dismiss = useCallback(
    (clientId: string) => {
      dispatch({ type: 'DISMISS_FILE', clientId });
    },
    [dispatch],
  );

  const dismissFailures = useCallback(() => {
    dispatch({ type: 'DISMISS_FAILURES' });
  }, [dispatch]);

  const toggleBanner = useCallback(() => {
    dispatch({ type: 'TOGGLE_BANNER' });
  }, [dispatch]);

  const setBannerExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ type: 'SET_BANNER', expanded });
    },
    [dispatch],
  );

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR_SESSION' });
    completeFiredRef.current = null;
  }, [dispatch]);

  return {
    isInFlight: hasUnfinishedWork && state.files.length > 0,
    acceptDrop,
    dismiss,
    dismissFailures,
    toggleBanner,
    setBannerExpanded,
    clear,
  };
};

// Exported for tests.
export const __TESTING__ = {
  CONCURRENT_UPLOADS,
  POLLING_INTERVAL_MS,
  INDEXED_FADE_MS,
};
