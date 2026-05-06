import { useEffect, useRef } from 'react';

// Fixed-interval poller used by the upload pipeline.
// - Starts when `enabled` is true; stops on disable or unmount.
// - Re-entrancy guarded: a long `fn()` does not stack invocations.
// - When `pauseOnHidden` is true (default), the poller halts while the
//   tab is hidden and runs immediately on visibility return so the UI
//   reflects post-suspension state without waiting a full interval.
//
// Cadence is fixed; per `web-document-upload.md` we do not back off.
// Errors thrown by `fn()` are swallowed — the caller is expected to
// surface failures through TanStack Query mutations or its own state.

export interface UsePollingOptions {
  intervalMs: number;
  enabled: boolean;
  pauseOnHidden?: boolean;
}

export const usePolling = (
  fn: () => Promise<void>,
  opts: UsePollingOptions,
): void => {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const { intervalMs, enabled, pauseOnHidden = true } = opts;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const isHidden = (): boolean =>
      pauseOnHidden &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden';

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (isHidden()) {
        // Don't schedule another tick — visibilitychange will resume.
        return;
      }
      inFlight = true;
      try {
        await fnRef.current();
      } catch {
        // Swallow — owners surface errors via their own mechanisms.
      } finally {
        inFlight = false;
        if (!cancelled && !isHidden()) {
          timer = setTimeout(tick, intervalMs);
        }
      }
    };

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (!isHidden()) {
        // Tab became visible — fire immediately to resync UI, then resume cadence.
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        void tick();
      } else if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    if (pauseOnHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      if (pauseOnHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [enabled, intervalMs, pauseOnHidden]);
};
