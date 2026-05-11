import { useEffect, useRef } from 'react';

import { useActiveDocumentSet } from '../features/collections/state';
import { useSelection, useSelectionState } from '../features/selection';
import { useEmitEvent } from '../host/useHost';

// Bridges the indexer's local selection state to the host's `onEvent` channel.
// Two responsibilities:
//   1. On collection switch, clear the selection and emit `selection/changed`
//      with literal empty arrays for the new collection. The emit uses
//      explicit empties rather than reading `state.documents` because the
//      state hasn't re-rendered yet at this point — it still carries the
//      previous collection's selection, which would be the wrong payload.
//   2. On any selection state change within the same collection, emit
//      `selection/changed` with the current arrays.
//
// Empty emits are tolerated per the host-contract docs (the consumer's reducer
// treats them idempotently), so the duplicate post-clear emit on the next
// render is harmless.
export const SelectionEventBridge = (): null => {
  const { documentSetId } = useActiveDocumentSet();
  const state = useSelectionState();
  const { clear } = useSelection();
  const emit = useEmitEvent();
  const lastDocumentSetIdRef = useRef<string | null>(documentSetId);

  useEffect(() => {
    const prevDocumentSetId = lastDocumentSetIdRef.current;
    const isCollectionSwitch = prevDocumentSetId !== documentSetId;
    if (isCollectionSwitch) {
      lastDocumentSetIdRef.current = documentSetId;
      clear();
      if (documentSetId) {
        emit({
          type: 'selection/changed',
          documentSetId,
          documents: [],
          folders: [],
        });
      }
      return;
    }
    if (!documentSetId) return;
    emit({
      type: 'selection/changed',
      documentSetId,
      documents: state.documents,
      folders: state.folders,
    });
  }, [documentSetId, state.documents, state.folders, clear, emit]);

  return null;
};
