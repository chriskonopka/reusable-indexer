import { ButtonHTMLAttributes, ComponentType, forwardRef } from 'react';
import styles from './IconButton.module.css';

// Icon-only button using a Phosphor outline-weight icon. 24×24 icon area
// inside a 32×32 hit target. Always carries an aria-label so screen readers
// know what the button does. Source: web-branding.md (icons + a11y).

interface IconComponentProps {
  size?: number;
  weight?: 'regular';
  className?: string;
}

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ComponentType<IconComponentProps>;
  ariaLabel: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, ariaLabel, type = 'button', className, ...rest }, ref) => {
    const classes = [styles.iconButton, className].filter(Boolean).join(' ');
    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        aria-label={ariaLabel}
        {...rest}
      >
        <Icon size={24} weight="regular" className={styles.icon} />
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
