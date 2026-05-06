import { isHydrateAction, usePersistedReducer } from '../../hooks/usePersistedReducer';

// Persisted UI state for the folder tree — expanded folder IDs keyed per
// (store: 'folders', key: documentSetId). Resets on collection switch via
// key={documentSetId} remounting in RootShell.

export interface FolderTreePersistedState {
  expandedFolderIds: string[];
}

type FolderTreeAction =
  | { type: 'EXPAND'; folderId: string }
  | { type: 'COLLAPSE'; folderId: string }
  | { type: 'EXPAND_MANY'; folderIds: string[] }
  | { type: '@@persistedReducer/HYDRATE'; payload: unknown };

const initialState: FolderTreePersistedState = { expandedFolderIds: [] };

const folderTreeReducer = (
  state: FolderTreePersistedState,
  action: FolderTreeAction,
): FolderTreePersistedState => {
  if (isHydrateAction(action)) {
    const payload = action.payload as Partial<FolderTreePersistedState> | undefined;
    return { ...state, ...(payload ?? {}) };
  }
  switch (action.type) {
    case 'EXPAND':
      if (state.expandedFolderIds.includes(action.folderId)) return state;
      return { expandedFolderIds: [...state.expandedFolderIds, action.folderId] };
    case 'COLLAPSE':
      return {
        expandedFolderIds: state.expandedFolderIds.filter((id) => id !== action.folderId),
      };
    case 'EXPAND_MANY': {
      const newIds = action.folderIds.filter(
        (id) => !state.expandedFolderIds.includes(id),
      );
      if (newIds.length === 0) return state;
      return { expandedFolderIds: [...state.expandedFolderIds, ...newIds] };
    }
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
};

export const useFolderTreeState = (documentSetId: string) =>
  usePersistedReducer(folderTreeReducer, initialState, {
    store: 'folders',
    key: documentSetId,
  });
