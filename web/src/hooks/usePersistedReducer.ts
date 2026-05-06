import { Dispatch, Reducer, useEffect, useReducer, useRef } from 'react';
import { getValue, putValue } from '../utils/idb';

// IndexedDB-backed reducer. Hydrates async; renders with `initial` first.
// On every dispatch, the next state is persisted under `key` in the
// `persistedReducer` object store. Storage failures are swallowed
// silently — falling back to in-memory state — per web-persistence.md.

interface PersistedReducerKey {
  /** Logical scope, e.g. 'collections', 'ui'. */
  store: string;
  /** Within-scope identifier — typically `${userId}:${documentSetId}` or 'global'. */
  key: string;
}

const STORE_NAME = 'persistedReducer';

const composeKey = ({ store, key }: PersistedReducerKey): string => `${store}:${key}`;

export const usePersistedReducer = <S, A>(
  reducer: Reducer<S, A>,
  initial: S,
  identity: PersistedReducerKey,
): [S, Dispatch<A>] => {
  const [state, dispatch] = useReducer(reducer, initial);
  const hydratedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const composedKey = composeKey(identity);

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false;
    getValue<S>(STORE_NAME, composedKey)
      .then((stored) => {
        if (cancelled) return;
        hydratedRef.current = true;
        if (stored !== undefined) {
          dispatch({ type: '@@persistedReducer/HYDRATE', payload: stored } as unknown as A);
        }
      })
      .catch(() => {
        // Storage unavailable — fall back to in-memory state.
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [composedKey]);

  // Write through after every state change once hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void putValue(STORE_NAME, composedKey, state).catch(() => {
      // Swallow — the in-memory copy is authoritative for this session.
    });
  }, [composedKey, state]);

  return [state, dispatch];
};

/**
 * Helper to fold a HYDRATE meta-action into a feature reducer. Use inside the
 * feature reducer's switch. Saves every reducer from re-implementing the
 * same hydrate branch.
 */
export const isHydrateAction = <A>(
  action: A,
): action is A & { type: '@@persistedReducer/HYDRATE'; payload: unknown } => {
  if (typeof action !== 'object' || action === null) return false;
  return (action as { type?: unknown }).type === '@@persistedReducer/HYDRATE';
};
