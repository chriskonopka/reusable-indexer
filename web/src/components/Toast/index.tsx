import { useToast, useToastQueue } from '../../hooks/useToast';
import styles from './Toast.module.css';

// Renders the queued toasts emitted by useToast(). The queue is owned by
// ToastProvider in hooks/useToast.tsx; this primitive is just the viewport.

export const ToastViewport = () => {
  const queue = useToastQueue();
  const { dismiss } = useToast();

  if (queue.length === 0) return null;

  return (
    <div className={styles.viewport} role="region" aria-label="Notifications" aria-live="polite">
      {queue.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.tone]}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className={styles.message}>{toast.message}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
