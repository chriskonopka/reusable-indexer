import { useCallback, useContext } from 'react';
import type { IndexerAppProps, IndexerEvent } from '@shared/types';
import { HostContext } from './HostContext';

// What belongs here: the only sanctioned way to read the host contract from
// inside the indexer. Throws if called outside HostProvider so misuse fails
// loudly at first render. See module-boundaries.md §2.

export const useHost = (): IndexerAppProps => {
  const value = useContext(HostContext);
  if (!value) {
    throw new Error(
      'useHost must be called inside <HostProvider>. The indexer was rendered without its host contract.',
    );
  }
  return value;
};

/**
 * Helper for emitting an IndexerEvent. Fire-and-forget — if the host did not
 * supply onEvent, the event is dropped silently. Stable across re-renders
 * provided the host's onEvent reference is stable.
 */
export const useEmitEvent = (): ((event: IndexerEvent) => void) => {
  const { onEvent } = useHost();
  return useCallback(
    (event) => {
      if (onEvent) onEvent(event);
    },
    [onEvent],
  );
};
