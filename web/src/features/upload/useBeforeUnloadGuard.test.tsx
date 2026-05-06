import { cleanup, render } from '@testing-library/react';
import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';

afterEach(() => cleanup());

const Harness = ({ enabled }: { enabled: boolean }) => {
  useBeforeUnloadGuard(enabled);
  return null;
};

describe('useBeforeUnloadGuard', () => {
  it('registers a listener that calls preventDefault while enabled', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Harness enabled />);
    expect(
      addSpy.mock.calls.some(([type]) => type === 'beforeunload'),
    ).toBe(true);

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    Object.assign(event, { returnValue: '' });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    expect(
      removeSpy.mock.calls.some(([type]) => type === 'beforeunload'),
    ).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('does not register a listener while disabled', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    render(<Harness enabled={false} />);
    expect(
      addSpy.mock.calls.filter(([type]) => type === 'beforeunload'),
    ).toHaveLength(0);
    addSpy.mockRestore();
  });

  it('detaches when toggled from enabled to disabled', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { rerender } = render(<Harness enabled />);
    rerender(<Harness enabled={false} />);
    expect(
      removeSpy.mock.calls.some(([type]) => type === 'beforeunload'),
    ).toBe(true);
    removeSpy.mockRestore();
  });
});
