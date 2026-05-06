import { act } from '@testing-library/react';

/**
 * Drains all pending IndexedDB operations from fake-indexeddb and ensures
 * any resulting React state updates are flushed.
 *
 * This uses two phases:
 *   1. A bare 50ms setTimeout (outside act) lets fake-indexeddb's setImmediate
 *      callbacks fire freely without React's scheduler intercepting them.
 *   2. An empty act() at the end flushes any React state updates triggered by
 *      IDB callbacks (e.g. the hydrate effect calling setState after idbGet).
 *
 * Use this before unmounting a hook/component that persists state to IDB.
 */
export const flushIDB = async () => {
  // Phase 1: let IDB operations complete outside React's act() boundary.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  // Phase 2: flush any React state updates that resulted from IDB callbacks.
  await act(async () => {});
};
