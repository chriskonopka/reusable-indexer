import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AccessRole, DocumentSetSummary, Paged } from '@shared/types';
import { useEmitEvent } from '../../host/useHost';
import { isHydrateAction, usePersistedReducer } from '../../hooks/usePersistedReducer';
import { queryKeys } from '../../api/queryKeys';

// Active-collection state for the indexer. Owned at the RootShell level via
// <ActiveDocumentSetProvider />; consumed by the sidebar (writes), by the
// main pane (reads), and by IndexerApp's imperative ref (writes).
//
// Persists `documentSetId` per user via IndexedDB so the last-active
// collection is restored on next mount (spec 3.2.1, 5.3).

interface ActiveDocumentSetPersistedState {
  documentSetId: string | null;
}

interface ActiveDocumentSetState {
  documentSetId: string | null;
  accessRole: AccessRole | null;
}

type Action =
  | { type: 'SELECT'; documentSetId: string; accessRole: AccessRole }
  | { type: 'CLEAR' }
  | { type: '@@persistedReducer/HYDRATE'; payload: unknown };

const initialState: ActiveDocumentSetState = {
  documentSetId: null,
  accessRole: null,
};

const reducer = (
  state: ActiveDocumentSetState,
  action: Action,
): ActiveDocumentSetState => {
  if (isHydrateAction(action)) {
    const payload = action.payload as ActiveDocumentSetPersistedState | undefined;
    if (!payload) return state;
    return {
      documentSetId: payload.documentSetId ?? null,
      // accessRole is recomputed from the freshly-fetched list when the
      // sidebar selects; stored as null until then.
      accessRole: null,
    };
  }
  switch (action.type) {
    case 'SELECT':
      return {
        documentSetId: action.documentSetId,
        accessRole: action.accessRole,
      };
    case 'CLEAR':
      return initialState;
  }
};

interface ActiveDocumentSetContextValue {
  documentSetId: string | null;
  accessRole: AccessRole | null;
  /** Activate a collection. The optional `fallbackAccessRole` is used when
   *  the list query cache hasn't yet refreshed (e.g. immediately after a
   *  create mutation) — without it, the lookup against stale cache returns
   *  null and `select()` silently no-ops. */
  select: (documentSetId: string | null, fallbackAccessRole?: AccessRole) => void;
  clear: () => void;
}

const ActiveDocumentSetContext = createContext<ActiveDocumentSetContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
}

export const ActiveDocumentSetProvider = ({ children }: ProviderProps) => {
  const [state, dispatch] = usePersistedReducer(reducer, initialState, {
    store: 'collections',
    key: 'last-active',
  });
  const emit = useEmitEvent();
  const queryClient = useQueryClient();
  const lastEmittedIdRef = useRef<string | null | undefined>(undefined);

  const lookupAccessRole = useCallback(
    (documentSetId: string): AccessRole | null => {
      const cached = queryClient.getQueryData<Paged<DocumentSetSummary>>(
        queryKeys.documentSets.list(),
      );
      const match = cached?.items.find((row) => row.documentSetId === documentSetId);
      return match?.accessRole ?? null;
    },
    [queryClient],
  );

  // After hydration, if a documentSetId was restored but accessRole is null,
  // resolve it from the cache once the list query completes. We watch the
  // list query and reconcile.
  useEffect(() => {
    if (!state.documentSetId || state.accessRole) return;
    const role = lookupAccessRole(state.documentSetId);
    if (role) {
      dispatch({ type: 'SELECT', documentSetId: state.documentSetId, accessRole: role });
      return;
    }
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (!state.documentSetId) return;
      const resolved = lookupAccessRole(state.documentSetId);
      if (resolved) {
        dispatch({ type: 'SELECT', documentSetId: state.documentSetId, accessRole: resolved });
      }
    });
    return unsubscribe;
  }, [state.documentSetId, state.accessRole, lookupAccessRole, queryClient, dispatch]);

  // Emit collection/activated whenever the active id changes (debounced
  // through a ref to avoid duplicate fires on hydrate-then-resolve).
  useEffect(() => {
    if (lastEmittedIdRef.current === state.documentSetId) return;
    lastEmittedIdRef.current = state.documentSetId;
    emit({
      type: 'collection/activated',
      documentSetId: state.documentSetId,
      accessRole: state.accessRole,
    });
  }, [state.documentSetId, state.accessRole, emit]);

  const select = useCallback(
    (documentSetId: string | null, fallbackAccessRole?: AccessRole) => {
      if (documentSetId === null) {
        dispatch({ type: 'CLEAR' });
        return;
      }
      const role = lookupAccessRole(documentSetId) ?? fallbackAccessRole ?? null;
      if (!role) {
        // Best-effort no-op: target is not in the user's accessible set.
        return;
      }
      dispatch({ type: 'SELECT', documentSetId, accessRole: role });
    },
    [dispatch, lookupAccessRole],
  );

  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [dispatch]);

  const value = useMemo<ActiveDocumentSetContextValue>(
    () => ({
      documentSetId: state.documentSetId,
      accessRole: state.accessRole,
      select,
      clear,
    }),
    [state.documentSetId, state.accessRole, select, clear],
  );

  return (
    <ActiveDocumentSetContext.Provider value={value}>
      {children}
    </ActiveDocumentSetContext.Provider>
  );
};

export const useActiveDocumentSet = (): ActiveDocumentSetContextValue => {
  const value = useContext(ActiveDocumentSetContext);
  if (!value) {
    throw new Error(
      'useActiveDocumentSet must be used inside <ActiveDocumentSetProvider>.',
    );
  }
  return value;
};
