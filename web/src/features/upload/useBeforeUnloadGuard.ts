import { useEffect } from 'react';

// Registers a `beforeunload` handler while `enabled` is true. Cross-browser
// idiom: call `preventDefault()` AND assign to `returnValue`. Modern
// browsers ignore custom strings and show their own confirmation copy.
// Spec 3.5.4.

export const useBeforeUnloadGuard = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [enabled]);
};
