import { renderHook } from '@testing-library/react';

import { ApiClientError } from '../api/client';
import { normalizeError } from '../utils/normalizeError';

import { useStaleDocsetRecovery } from './useStaleDocsetRecovery';

// Logic-only hook with no rendered DOM output, so there is no axe assertion —
// jest-axe requires a rendered container.

const apiError = (status: number): ApiClientError =>
  new ApiClientError(
    normalizeError({
      type: 'about:blank',
      title: 'Error',
      status,
      detail: 'boom',
    }),
    'op-1',
  );

describe('useStaleDocsetRecovery', () => {
  it('returns true and fires onStaleDocset on a 404', () => {
    const onStaleDocset = jest.fn();
    const { result } = renderHook(() => useStaleDocsetRecovery(apiError(404), onStaleDocset));
    expect(result.current).toBe(true);
    expect(onStaleDocset).toHaveBeenCalledTimes(1);
  });

  it('returns true and fires onStaleDocset on a 403', () => {
    const onStaleDocset = jest.fn();
    const { result } = renderHook(() => useStaleDocsetRecovery(apiError(403), onStaleDocset));
    expect(result.current).toBe(true);
    expect(onStaleDocset).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a 500 and returns false', () => {
    const onStaleDocset = jest.fn();
    const { result } = renderHook(() => useStaleDocsetRecovery(apiError(500), onStaleDocset));
    expect(result.current).toBe(false);
    expect(onStaleDocset).not.toHaveBeenCalled();
  });

  it('ignores non-ApiClientError values (e.g. a 404-looking plain error)', () => {
    const onStaleDocset = jest.fn();
    const { result } = renderHook(() =>
      useStaleDocsetRecovery(new Error('Not found: 404'), onStaleDocset),
    );
    expect(result.current).toBe(false);
    expect(onStaleDocset).not.toHaveBeenCalled();
  });

  it('does nothing when there is no error', () => {
    const onStaleDocset = jest.fn();
    const { result } = renderHook(() => useStaleDocsetRecovery(null, onStaleDocset));
    expect(result.current).toBe(false);
    expect(onStaleDocset).not.toHaveBeenCalled();
  });

  it('does not throw when no handler is supplied', () => {
    const { result } = renderHook(() => useStaleDocsetRecovery(apiError(404)));
    expect(result.current).toBe(true);
  });

  it('fires again only when the error transitions back into a stale state', () => {
    const onStaleDocset = jest.fn();
    const { rerender } = renderHook(
      ({ error }: { error: unknown }) => useStaleDocsetRecovery(error, onStaleDocset),
      { initialProps: { error: apiError(404) as unknown } },
    );
    expect(onStaleDocset).toHaveBeenCalledTimes(1);

    // Re-render while still stale — effect deps unchanged, no extra fire.
    rerender({ error: apiError(404) as unknown });
    expect(onStaleDocset).toHaveBeenCalledTimes(1);

    // Recover, then go stale again — fires once more.
    rerender({ error: null });
    rerender({ error: apiError(403) as unknown });
    expect(onStaleDocset).toHaveBeenCalledTimes(2);
  });
});
