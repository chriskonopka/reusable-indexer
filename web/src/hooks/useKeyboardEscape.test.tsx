import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useKeyboardEscape } from './useKeyboardEscape';

interface HarnessProps {
  active: boolean;
  onEscape: () => void;
}

const Harness = ({ active, onEscape }: HarnessProps) => {
  useKeyboardEscape(active, onEscape);
  return <div data-testid="harness" />;
};

describe('useKeyboardEscape', () => {
  it('invokes onEscape when Escape is pressed and active=true', async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    render(<Harness active={true} onEscape={onEscape} />);

    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when active=false', async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    render(<Harness active={false} onEscape={onEscape} />);

    await user.keyboard('{Escape}');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    render(<Harness active={true} onEscape={onEscape} />);

    await user.keyboard('{Enter}');
    await user.keyboard('a');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    const { unmount } = render(<Harness active={true} onEscape={onEscape} />);

    unmount();
    await user.keyboard('{Escape}');
    expect(onEscape).not.toHaveBeenCalled();
  });
});
