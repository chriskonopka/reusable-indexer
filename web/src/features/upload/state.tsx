import {
  ReactNode,
  createContext,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import type {
  BatchStatus,
  FailureSeverity,
  UploadFile,
  UploadSessionState,
} from '@shared/types';

// Upload-session state. One session at a time across the indexer; lives in
// memory only (data-model.md §2.1 — never persisted, cleared at terminal
// status). The reducer here is the single mutator.
//
// `<UploadProvider />` exposes [state, dispatch] via context. The
// orchestration logic (`useUploadController`) is the only consumer that
// dispatches — components read state through derived hooks below.

export type AggregateStatus = UploadSessionState['aggregateStatus'];

export type UploadAction =
  | {
      type: 'START_SESSION';
      targetDocumentSetId: string;
      files: UploadFile[];
    }
  | { type: 'APPEND_FILES'; files: UploadFile[] }
  | { type: 'SET_BATCH_ID'; batchId: string }
  | {
      type: 'PATCH_FILE';
      clientId: string;
      patch: Partial<Omit<UploadFile, 'clientId' | 'file'>>;
    }
  | { type: 'PATCH_FILES'; entries: Array<{ clientId: string; patch: Partial<Omit<UploadFile, 'clientId' | 'file'>> }> }
  | { type: 'DISMISS_FILE'; clientId: string }
  | { type: 'DISMISS_FAILURES' }
  | { type: 'SET_AGGREGATE'; status: AggregateStatus }
  | { type: 'TOGGLE_BANNER' }
  | { type: 'SET_BANNER'; expanded: boolean }
  | { type: 'CLEAR_SESSION' };

const emptyState: UploadSessionState = {
  batchId: null,
  targetDocumentSetId: '',
  files: [],
  aggregateStatus: 'Idle',
  bannerExpanded: false,
};

const replaceFile = (
  files: UploadFile[],
  clientId: string,
  patch: Partial<Omit<UploadFile, 'clientId' | 'file'>>,
): UploadFile[] => {
  let touched = false;
  const next = files.map((file) => {
    if (file.clientId !== clientId) return file;
    touched = true;
    return { ...file, ...patch };
  });
  return touched ? next : files;
};

export const uploadReducer = (
  state: UploadSessionState,
  action: UploadAction,
): UploadSessionState => {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...emptyState,
        targetDocumentSetId: action.targetDocumentSetId,
        files: action.files,
        aggregateStatus: action.files.length === 0 ? 'Idle' : 'Pending',
        bannerExpanded: state.bannerExpanded,
      };
    case 'APPEND_FILES':
      return { ...state, files: [...state.files, ...action.files] };
    case 'SET_BATCH_ID':
      return { ...state, batchId: action.batchId };
    case 'PATCH_FILE': {
      const nextFiles = replaceFile(state.files, action.clientId, action.patch);
      return nextFiles === state.files ? state : { ...state, files: nextFiles };
    }
    case 'PATCH_FILES': {
      let next = state.files;
      for (const entry of action.entries) {
        next = replaceFile(next, entry.clientId, entry.patch);
      }
      return next === state.files ? state : { ...state, files: next };
    }
    case 'DISMISS_FILE':
      return {
        ...state,
        files: state.files.filter((file) => file.clientId !== action.clientId),
      };
    case 'DISMISS_FAILURES':
      return {
        ...state,
        files: state.files.filter(
          (file) =>
            file.status !== 'Failed' &&
            file.status !== 'Unsupported' &&
            file.status !== 'Duplicate',
        ),
      };
    case 'SET_AGGREGATE':
      return { ...state, aggregateStatus: action.status };
    case 'TOGGLE_BANNER':
      return { ...state, bannerExpanded: !state.bannerExpanded };
    case 'SET_BANNER':
      return { ...state, bannerExpanded: action.expanded };
    case 'CLEAR_SESSION':
      return { ...emptyState, bannerExpanded: state.bannerExpanded };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
};

interface UploadContextValue {
  state: UploadSessionState;
  dispatch: React.Dispatch<UploadAction>;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(uploadReducer, emptyState);
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};

const useUploadContext = (): UploadContextValue => {
  const value = useContext(UploadContext);
  if (!value) {
    throw new Error('Upload state must be read inside <UploadProvider>.');
  }
  return value;
};

export const useUploadState = (): UploadSessionState => useUploadContext().state;
export const useUploadDispatch = (): React.Dispatch<UploadAction> =>
  useUploadContext().dispatch;

// ---------------------------------------------------------------------------
// Status mapping helpers — pure functions (used by the controller and by
// derived hooks).
// ---------------------------------------------------------------------------

export const severityFromStatus = (
  status: UploadFile['status'],
): FailureSeverity | null => {
  if (status === 'Failed') return 'Fail';
  if (status === 'Unsupported' || status === 'Duplicate') return 'Skip';
  return null;
};

export const isUploadFinished = (status: BatchStatus | AggregateStatus): boolean =>
  status === 'Completed' ||
  status === 'CompletedWithErrors' ||
  status === 'Failed';

export const isUploadInFlight = (status: AggregateStatus): boolean =>
  status === 'Pending' || status === 'InProgress';

// Internal, exported only for tests.
export const __INITIAL_UPLOAD_STATE__ = emptyState;
