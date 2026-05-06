import { useEffect, useState } from 'react';

// Debounces a fast-changing input value (filename filter, share-dialog email
// lookup). Returns the latest value seen after `delayMs` of quiet.
//
// `delayMs <= 0` returns the live value (useful for tests that disable the
// delay without forking the production code path).

export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
};
