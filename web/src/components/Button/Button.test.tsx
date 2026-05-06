import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Button } from './index';

describe('Button', () => {
  it('renders the children with the primary variant by default', () => {
    render(<Button>save</Button>);
    const button = screen.getByRole('button', { name: 'save' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('respects an explicit type override (e.g. submit)', () => {
    render(<Button type="submit">submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('renders the secondary variant when requested', () => {
    render(<Button variant="secondary">cancel</Button>);
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument();
  });

  it('disables the button when disabled is true', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        save
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables the button while loading and exposes aria-busy', () => {
    render(<Button loading>save</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('forwards arbitrary HTML props (data-, aria-, etc.)', () => {
    render(
      <Button data-testid="ref-btn" aria-label="alt-label">
        x
      </Button>,
    );
    const button = screen.getByTestId('ref-btn');
    expect(button).toHaveAttribute('aria-label', 'alt-label');
  });

  it('fires onClick when enabled and clicked', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>go</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations in the default rendered state', async () => {
    const { container } = render(<Button>save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the disabled state', async () => {
    const { container } = render(<Button disabled>save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the loading state', async () => {
    const { container } = render(<Button loading>save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the secondary variant', async () => {
    const { container } = render(<Button variant="secondary">cancel</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations at small size', async () => {
    const { container } = render(<Button size="small">x</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
