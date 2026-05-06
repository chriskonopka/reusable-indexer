import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { IconButton } from './index';

const FakeIcon = ({ size, weight, className }: { size?: number; weight?: 'regular'; className?: string }) => (
  <svg
    data-testid="icon"
    data-size={size}
    data-weight={weight}
    className={className}
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
  />
);

describe('IconButton', () => {
  it('renders the supplied icon at 24px regular weight', () => {
    render(<IconButton icon={FakeIcon} ariaLabel="add" />);
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('data-size', '24');
    expect(icon).toHaveAttribute('data-weight', 'regular');
  });

  it('uses the aria-label as the accessible name', () => {
    render(<IconButton icon={FakeIcon} ariaLabel="delete collection" />);
    expect(screen.getByRole('button', { name: 'delete collection' })).toBeInTheDocument();
  });

  it('defaults type to button', () => {
    render(<IconButton icon={FakeIcon} ariaLabel="x" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('fires onClick when activated', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<IconButton icon={FakeIcon} ariaLabel="x" onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respects disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<IconButton icon={FakeIcon} ariaLabel="x" disabled onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no axe violations in the default state', async () => {
    const { container } = render(<IconButton icon={FakeIcon} ariaLabel="add" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the disabled state', async () => {
    const { container } = render(<IconButton icon={FakeIcon} ariaLabel="add" disabled />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
