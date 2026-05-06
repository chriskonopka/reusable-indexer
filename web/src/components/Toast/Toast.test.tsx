import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ToastProvider, useToast } from '../../hooks/useToast';
import { ToastViewport } from './index';

const Pusher = ({ message, tone }: { message: string; tone: 'info' | 'error' | 'success' }) => {
  const { push } = useToast();
  return (
    <button type="button" onClick={() => push(message, tone)}>
      push
    </button>
  );
};

const wrap = (children: ReactNode) => <ToastProvider>{children}</ToastProvider>;

describe('ToastViewport', () => {
  it('renders nothing when the queue is empty', () => {
    render(wrap(<ToastViewport />));
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('renders a pushed info toast as a status region', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <Pusher message="Saved" tone="info" />
          <ToastViewport />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error toast as an alert', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <Pusher message="Boom" tone="error" />
          <ToastViewport />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('dismisses a toast when the user clicks the dismiss button', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <>
          <Pusher message="Saved" tone="success" />
          <ToastViewport />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'push' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('auto-dismisses after the timeout', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      wrap(
        <>
          <Pusher message="Gone soon" tone="info" />
          <ToastViewport />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'push' }));
    expect(screen.getByText('Gone soon')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Gone soon')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('has no axe violations when empty', async () => {
    const { container } = render(wrap(<ToastViewport />));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations when populated with each tone', async () => {
    const Multi = () => {
      const { push } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            push('A', 'info');
            push('B', 'success');
            push('C', 'error');
          }}
        >
          burst
        </button>
      );
    };

    const user = userEvent.setup();
    const { container } = render(
      wrap(
        <>
          <Multi />
          <ToastViewport />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'burst' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
