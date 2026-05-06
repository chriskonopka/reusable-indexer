import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react';
import styles from './Button.module.css';

// MWS Primary/Secondary button. ALL CAPS labels, 2px radius, 36×140 minimum.
// Source of styling rules: /.claude/rules/web-branding.md.

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'default' | 'small';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'default',
      loading = false,
      disabled,
      type = 'button',
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const classes = [
      styles.button,
      styles[variant],
      size === 'small' ? styles.small : null,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
