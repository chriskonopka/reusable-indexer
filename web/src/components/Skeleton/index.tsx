import styles from './Skeleton.module.css';

// Loading-state placeholder. Three shape variants cover every async-bound
// surface in the indexer (table row, image / large block, single text line).

export type SkeletonVariant = 'row' | 'rect' | 'text';

interface SkeletonProps {
  variant: SkeletonVariant;
  ariaLabel?: string;
}

export const Skeleton = ({ variant, ariaLabel = 'Loading' }: SkeletonProps) => (
  <span
    className={`${styles.skeleton} ${styles[variant]}`}
    role="status"
    aria-label={ariaLabel}
    aria-live="polite"
  />
);
