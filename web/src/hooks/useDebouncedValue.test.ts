import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('start', 200));
    expect(result.current).toBe('start');
  });

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('b');
  });

  it('coalesces rapid changes into the last value', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ value: 'c' });
    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(result.current).toBe('a');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('c');
  });

  it('returns the live value when delayMs <= 0', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 0),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    // No timer; the effect runs synchronously after commit.
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current).toBe('b');
  });
});
