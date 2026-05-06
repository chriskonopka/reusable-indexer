import { ComponentType, ReactNode } from 'react';
import styles from './EmptyState.module.css';

// Empty-state primitive used wherever a list could be empty (no collections,
// no files, no matches). Spec 3.8.

interface IconComponentProps {
  size?: number;
  weight?: 'regular';
  className?: string;
}

interface EmptyStateProps {
  icon?: ComponentType<IconComponentProps>;
  title: string;
  body?: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon: Icon, title, body, action }: EmptyStateProps) => {
  return (
    <div className={styles.empty} role="status">
      {Icon && (
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={32} weight="regular" />
        </span>
      )}
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
};
