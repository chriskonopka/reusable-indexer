import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from 'react';

// Chat-scope selection: the set of documents and folders the user has
// checked in the file list / folder tree. The consuming app subscribes to
// `selection/changed` host events derived from this state and uses it to
// narrow chat retrieval (see /shared/types/host-contract.ts).
//
// Selection lives at the IndexerApp scope so it survives folder navigation
// within a collection but resets on collection switch. The cap is enforced
// at the reducer boundary — add/replace actions that would exceed it are
// clamped silently; the calling hook surfaces a toast.
//
// Cap matches the API's ValidationFailed boundary on SendMessageRequest.
export const SELECTION_CAP_PER_KIND = 64;

export interface SelectedDocument {
  documentId: string;
  fileName: string;
}

export interface SelectedFolder {
  folderId: string;
  folderName: string;
  /** Slash-joined ancestor path ending in folderName. Used by the consumer
   *  to disambiguate same-named folders at different levels. */
  path: string;
}

export interface SelectionState {
  documents: SelectedDocument[];
  folders: SelectedFolder[];
}

const emptyState: SelectionState = {
  documents: [],
  folders: [],
};

export type SelectionAction =
  | { type: 'SET_DOCUMENTS'; documents: SelectedDocument[] }
  | { type: 'SET_FOLDERS'; folders: SelectedFolder[] }
  | { type: 'CLEAR' };

export const selectionReducer = (
  state: SelectionState,
  action: SelectionAction,
): SelectionState => {
  switch (action.type) {
    case 'SET_DOCUMENTS': {
      const clamped = action.documents.slice(0, SELECTION_CAP_PER_KIND);
      // No-op if shallow-equal — avoid spurious re-renders.
      if (clamped.length === state.documents.length) {
        const same = clamped.every(
          (doc, index) => doc.documentId === state.documents[index]?.documentId,
        );
        if (same) return state;
      }
      return { ...state, documents: clamped };
    }
    case 'SET_FOLDERS': {
      const clamped = action.folders.slice(0, SELECTION_CAP_PER_KIND);
      if (clamped.length === state.folders.length) {
        const same = clamped.every(
          (folder, index) => folder.folderId === state.folders[index]?.folderId,
        );
        if (same) return state;
      }
      return { ...state, folders: clamped };
    }
    case 'CLEAR':
      return state.documents.length === 0 && state.folders.length === 0
        ? state
        : emptyState;
    default: {
      // Exhaustiveness — TS will fail to compile if a new action is added
      // without a matching case. Matches the pattern used by uploadReducer.
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
};

interface SelectionContextValue {
  state: SelectionState;
  dispatch: React.Dispatch<SelectionAction>;
  /** Mirrors `state` synchronously so callbacks invoked multiple times in
   *  the same render pass read the latest snapshot instead of a stale
   *  closure. Reads through this ref are safe — writes happen only via
   *  dispatch, never directly. */
  stateRef: React.MutableRefObject<SelectionState>;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export const SelectionProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(selectionReducer, emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const value = useMemo(() => ({ state, dispatch, stateRef }), [state]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

const useSelectionContext = (): SelectionContextValue => {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used inside <SelectionProvider>.');
  return ctx;
};

export const useSelectionState = (): SelectionState =>
  useSelectionContext().state;

export interface SelectionApi {
  state: SelectionState;
  /** True if the document is currently in the selection. */
  hasDocument: (documentId: string) => boolean;
  /** True if the folder is currently in the selection. */
  hasFolder: (folderId: string) => boolean;
  /** Add or remove a single document. Returns true on add, false on remove,
   *  null when the add was refused because of the cap. */
  toggleDocument: (doc: SelectedDocument) => 'added' | 'removed' | 'cap-reached';
  /** Add or remove a single folder. */
  toggleFolder: (folder: SelectedFolder) => 'added' | 'removed' | 'cap-reached';
  /** Replace the documents matching the visible-id list with the supplied
   *  set. Used by the FileList header checkbox for select-all-visible. */
  setVisibleDocuments: (
    visibleIds: ReadonlyArray<string>,
    next: ReadonlyArray<SelectedDocument>,
  ) => { addedCount: number; capReached: boolean };
  clear: () => void;
}

export const useSelection = (): SelectionApi => {
  const { state, dispatch, stateRef } = useSelectionContext();

  // All mutating callbacks read through `stateRef.current` rather than the
  // captured `state` from this render, so callers that invoke them multiple
  // times in a single act block — or in tight succession outside React's
  // commit cycle — see the cumulative effect, not a stale snapshot.

  const hasDocument = useCallback(
    (documentId: string) =>
      state.documents.some((doc) => doc.documentId === documentId),
    [state.documents],
  );

  const hasFolder = useCallback(
    (folderId: string) => state.folders.some((row) => row.folderId === folderId),
    [state.folders],
  );

  const toggleDocument = useCallback(
    (doc: SelectedDocument): 'added' | 'removed' | 'cap-reached' => {
      const current = stateRef.current.documents;
      const exists = current.some((row) => row.documentId === doc.documentId);
      if (exists) {
        const nextDocs = current.filter((row) => row.documentId !== doc.documentId);
        stateRef.current = { ...stateRef.current, documents: nextDocs };
        dispatch({ type: 'SET_DOCUMENTS', documents: nextDocs });
        return 'removed';
      }
      if (current.length >= SELECTION_CAP_PER_KIND) return 'cap-reached';
      const nextDocs = [...current, doc];
      stateRef.current = { ...stateRef.current, documents: nextDocs };
      dispatch({ type: 'SET_DOCUMENTS', documents: nextDocs });
      return 'added';
    },
    [dispatch, stateRef],
  );

  const toggleFolder = useCallback(
    (folder: SelectedFolder): 'added' | 'removed' | 'cap-reached' => {
      const current = stateRef.current.folders;
      const exists = current.some((row) => row.folderId === folder.folderId);
      if (exists) {
        const nextFolders = current.filter((row) => row.folderId !== folder.folderId);
        stateRef.current = { ...stateRef.current, folders: nextFolders };
        dispatch({ type: 'SET_FOLDERS', folders: nextFolders });
        return 'removed';
      }
      if (current.length >= SELECTION_CAP_PER_KIND) return 'cap-reached';
      const nextFolders = [...current, folder];
      stateRef.current = { ...stateRef.current, folders: nextFolders };
      dispatch({ type: 'SET_FOLDERS', folders: nextFolders });
      return 'added';
    },
    [dispatch, stateRef],
  );

  const setVisibleDocuments = useCallback(
    (
      visibleIds: ReadonlyArray<string>,
      next: ReadonlyArray<SelectedDocument>,
    ): { addedCount: number; capReached: boolean } => {
      // Drop the currently-visible IDs from the existing selection, then
      // splice in the new set. Preserves selection of rows outside the
      // current filter. The cap is enforced by the reducer; we report back
      // whether any were dropped so the caller can toast.
      const visibleSet = new Set(visibleIds);
      const current = stateRef.current.documents;
      const preserved = current.filter((doc) => !visibleSet.has(doc.documentId));
      const merged = [...preserved, ...next];
      const clamped = merged.slice(0, SELECTION_CAP_PER_KIND);
      stateRef.current = { ...stateRef.current, documents: clamped };
      dispatch({ type: 'SET_DOCUMENTS', documents: clamped });
      return {
        addedCount: clamped.length - preserved.length,
        capReached: merged.length > SELECTION_CAP_PER_KIND,
      };
    },
    [dispatch, stateRef],
  );

  const clear = useCallback(() => {
    stateRef.current = emptyState;
    dispatch({ type: 'CLEAR' });
  }, [dispatch, stateRef]);

  return {
    state,
    hasDocument,
    hasFolder,
    toggleDocument,
    toggleFolder,
    setVisibleDocuments,
    clear,
  };
};
