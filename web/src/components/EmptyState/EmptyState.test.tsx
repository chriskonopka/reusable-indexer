import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { EmptyState } from './index';

const FakeIcon = ({ size }: { size?: number }) => (
  <svg data-testid="empty-icon" data-size={size} aria-hidden="true" focusable="false" />
);

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No collections yet" />);
    expect(screen.getByRole('heading', { name: 'No collections yet' })).toBeInTheDocument();
  });

  it('renders the body when supplied', () => {
    render(<EmptyState title="No collections" body="Click 'New collection' to get started." />);
    expect(screen.getByText(/Click 'New collection' to get started/)).toBeInTheDocument();
  });

  it('renders the icon at 32px when supplied', () => {
    render(<EmptyState icon={FakeIcon} title="No files" />);
    expect(screen.getByTestId('empty-icon')).toHaveAttribute('data-size', '32');
  });

  it('renders the action node', () => {
    render(
      <EmptyState
        title="No collections yet"
        action={<button type="button">New collection</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'New collection' })).toBeInTheDocument();
  });

  it('has no axe violations with title only', async () => {
    const { container } = render(<EmptyState title="No collections" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations with all slots populated', async () => {
    const { container } = render(
      <EmptyState
        icon={FakeIcon}
        title="No files yet"
        body="Drag files here or click 'Add' to get started."
        action={<button type="button">Add files</button>}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
