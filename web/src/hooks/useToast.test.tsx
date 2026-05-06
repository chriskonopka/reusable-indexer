import { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast, useToastQueue } from './useToast';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('useToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pushes a toast and exposes it via the queue', () => {
    const { result } = renderHook(
      () => ({ api: useToast(), queue: useToastQueue() }),
      { wrapper },
    );

    act(() => {
      result.current.api.push('Saved', 'success');
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0]).toMatchObject({ message: 'Saved', tone: 'success' });
    expect(result.current.queue[0].id).toMatch(/[0-9a-f-]+/);
  });

  it('auto-dismisses after the configured timeout', () => {
    const { result } = renderHook(
      () => ({ api: useToast(), queue: useToastQueue() }),
      { wrapper },
    );

    act(() => {
      result.current.api.push('Saved', 'success');
    });
    expect(result.current.queue).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.queue).toHaveLength(0);
  });

  it('manually dismisses a toast and cancels its auto-dismiss timer', () => {
    const { result } = renderHook(
      () => ({ api: useToast(), queue: useToastQueue() }),
      { wrapper },
    );

    let id = '';
    act(() => {
      id = result.current.api.push('Saved', 'success');
    });
    act(() => {
      result.current.api.dismiss(id);
    });
    expect(result.current.queue).toHaveLength(0);

    // Advancing time after dismissal does not produce errors or republish.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.queue).toHaveLength(0);
  });

  it('queues multiple toasts independently', () => {
    const { result } = renderHook(
      () => ({ api: useToast(), queue: useToastQueue() }),
      { wrapper },
    );

    act(() => {
      result.current.api.push('A', 'info');
      result.current.api.push('B', 'error');
    });

    expect(result.current.queue.map((t) => t.message)).toEqual(['A', 'B']);
  });

  it('throws when used outside ToastProvider', () => {
    const Outside = () => {
      useToast();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Outside />)).toThrow(/inside <ToastProvider>/);
    consoleError.mockRestore();
  });

  it('returns an empty queue when consumed without a provider', () => {
    // useToastQueue uses defaultValue [], so no throw.
    let result: ReturnType<typeof useToastQueue> = ['placeholder' as unknown as never];
    const Probe = () => {
      result = useToastQueue();
      return null;
    };
    render(<Probe />);
    expect(result).toEqual([]);
  });

  it('renders children passed to the provider', () => {
    render(
      <ToastProvider>
        <span>app</span>
      </ToastProvider>,
    );
    expect(screen.getByText('app')).toBeInTheDocument();
  });
});

// Smoke-test that user interaction can dismiss a toast through the API.
describe('useToast — interactive dismiss', () => {
  it('dismisses on a user click of a host-rendered control', async () => {
    jest.useRealTimers();
    const user = userEvent.setup();

    const Demo = () => {
      const { push, dismiss } = useToast();
      const queue = useToastQueue();
      return (
        <div>
          <button type="button" onClick={() => push('Hi', 'info')}>
            push
          </button>
          {queue.map((toast) => (
            <button
              key={toast.id}
              type="button"
              onClick={() => dismiss(toast.id)}
            >
              dismiss-{toast.message}
            </button>
          ))}
        </div>
      );
    };

    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByRole('button', { name: 'dismiss-Hi' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'dismiss-Hi' }));
    expect(screen.queryByRole('button', { name: 'dismiss-Hi' })).not.toBeInTheDocument();
  });
});
