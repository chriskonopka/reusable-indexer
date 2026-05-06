import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Skeleton, SkeletonVariant } from './index';

const variants: SkeletonVariant[] = ['row', 'rect', 'text'];

describe('Skeleton', () => {
  it('renders with the default Loading aria-label', () => {
    render(<Skeleton variant="row" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses an explicit aria-label when supplied', () => {
    render(<Skeleton variant="row" ariaLabel="Loading collections" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading collections');
  });

  it.each(variants)('has no axe violations in the %s variant', async (variant) => {
    const { container } = render(<Skeleton variant={variant} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
