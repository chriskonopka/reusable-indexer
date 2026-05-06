import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

interface HarnessProps {
  active: boolean;
}

const Harness = ({ active }: HarnessProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(active, containerRef);
  return (
    <>
      <button type="button">outside-before</button>
      <div ref={containerRef} tabIndex={-1}>
        <button type="button">first</button>
        <button type="button">middle</button>
        <button type="button">last</button>
      </div>
      <button type="button">outside-after</button>
    </>
  );
};

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', () => {
    render(<Harness active={true} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('cycles forward Tab from the last to the first focusable', async () => {
    const user = userEvent.setup();
    render(<Harness active={true} />);

    screen.getByRole('button', { name: 'last' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('cycles Shift+Tab from the first to the last focusable', async () => {
    const user = userEvent.setup();
    render(<Harness active={true} />);

    screen.getByRole('button', { name: 'first' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
  });

  it('does not engage when active=false', () => {
    render(<Harness active={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('returns focus to the previously focused element on teardown', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside-pre';
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { unmount } = render(<Harness active={true} />);
    unmount();
    expect(document.activeElement).toBe(outside);
    document.body.removeChild(outside);
  });
});
