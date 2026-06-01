import { useEffect } from 'react';

import { ApiClientError } from '../api/client';

// A 403 or 404 on a collection-scoped listing request (folder tree, folder
// contents) means the active collection is no longer reachable: it was
// deleted, or the caller's share was revoked. The host contract documents
// this case — `collection/activated` is emitted with `null` when the active
// collection was deleted (shared/types/host-contract.ts) — and the consuming
// app resets its URL to root on that event. The listing surfaces previously
// dead-ended on a generic "Could not load…" message with no recovery, which
// stranded users on a stale `/c/{id}` deep-link that a refresh could not
// clear (only a full re-login, which drops the deep-link, would).
//
// This hook detects that condition from a TanStack Query error and invokes
// `onStaleDocset` so the caller can deselect the active collection (which in
// turn emits `collection/activated: null`). It returns whether the error is a
// stale-docset error so the caller can suppress its generic error UI while the
// deselect propagates and unmounts the pane.
//
// A 401 is deliberately NOT treated here — the API client escalates 401s to
// the host as `auth/expired` (api/client.ts); a stale collection is a
// different, non-auth condition.
export const useStaleDocsetRecovery = (error: unknown, onStaleDocset?: () => void): boolean => {
  const status = error instanceof ApiClientError ? error.normalized.status : null;
  const isStaleDocset = status === 403 || status === 404;

  useEffect(() => {
    if (isStaleDocset) onStaleDocset?.();
  }, [isStaleDocset, onStaleDocset]);

  return isStaleDocset;
};
