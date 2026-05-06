import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { usePolling } from './usePolling';

const flushMicrotasks = () => Promise.resolve();

describe('usePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const Harness = ({
    fn,
    intervalMs,
    enabled,
    pauseOnHidden,
  }: {
    fn: () => Promise<void>;
    intervalMs: number;
    enabled: boolean;
    pauseOnHidden?: boolean;
  }) => {
    usePolling(fn, { intervalMs, enabled, pauseOnHidden });
    return null;
  };

  it('does not invoke fn while disabled', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    render(<Harness fn={fn} intervalMs={1000} enabled={false} />);
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await flushMicrotasks();
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes fn immediately on enable, then on each interval', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    render(<Harness fn={fn} intervalMs={1000} enabled />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance one interval at a time so the resolved promise from the
    // previous tick has a chance to schedule the next setTimeout before
    // fake-timers advances past it.
    for (let tick = 0; tick < 3; tick += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await flushMicrotasks();
        await flushMicrotasks();
      });
    }
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not stack invocations when fn is slow', async () => {
    const resolvers: Array<() => void> = [];
    const fn = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(<Harness fn={fn} intervalMs={500} enabled />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]();
      await flushMicrotasks();
      jest.advanceTimersByTime(500);
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('pauses while the tab is hidden and resumes immediately on visibility', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    render(<Harness fn={fn} intervalMs={1000} enabled />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(5000);
      await flushMicrotasks();
    });
    // No new calls while hidden.
    expect(fn).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flushMicrotasks();
    });
    // Immediate fire on visibility return.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('swallows errors thrown by fn and keeps polling', async () => {
    const fn = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    render(<Harness fn={fn} intervalMs={500} enabled />);
    await act(async () => {
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(500);
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cleans up the timer when the component unmounts', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const { unmount } = render(<Harness fn={fn} intervalMs={500} enabled />);
    await act(async () => {
      await flushMicrotasks();
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops when toggled from enabled to disabled', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const Wrapper = () => {
      const [enabled, setEnabled] = useState(true);
      usePolling(fn, { intervalMs: 500, enabled });
      return (
        <button type="button" onClick={() => setEnabled(false)}>
          off
        </button>
      );
    };
    const { getByRole } = render(<Wrapper />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    act(() => {
      getByRole('button', { name: 'off' }).click();
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await flushMicrotasks();
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
