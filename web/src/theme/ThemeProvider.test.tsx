import { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeProvider';

const wrapper = (props: { initialTheme?: 'light' | 'dark' } = {}) => {
  const Wrapped = ({ children }: { children: ReactNode }) => (
    <ThemeProvider {...props}>{children}</ThemeProvider>
  );
  Wrapped.displayName = 'ThemeProviderTestWrapper';
  return Wrapped;
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
  });

  it('applies CSS custom properties for the resolved mode', () => {
    render(
      <ThemeProvider initialTheme="dark">
        <p data-testid="probe">probe</p>
      </ThemeProvider>,
    );
    const wrapperEl = screen.getByTestId('probe').parentElement!;
    expect(wrapperEl.getAttribute('data-indexer-theme')).toBe('dark');
    expect(wrapperEl.style.getPropertyValue('--bg-page')).toBe('#13134E');
  });

  it('mirrors data-theme on the documentElement', () => {
    render(
      <ThemeProvider initialTheme="light">
        <p>x</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists the mode to localStorage', () => {
    render(
      <ThemeProvider initialTheme="dark">
        <p>x</p>
      </ThemeProvider>,
    );
    expect(window.localStorage.getItem('theme-preference')).toBe('dark');
  });

  it('reads a persisted mode on mount over the system default', () => {
    window.localStorage.setItem('theme-preference', 'dark');
    render(
      <ThemeProvider>
        <p>x</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to light when neither initialTheme nor persisted nor matchMedia signal dark', () => {
    render(
      <ThemeProvider>
        <p>x</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggleMode flips between light and dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ initialTheme: 'light' }) });
    expect(result.current.mode).toBe('light');

    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe('dark');
    expect(window.localStorage.getItem('theme-preference')).toBe('dark');

    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe('light');
  });

  it('setMode jumps directly to the requested mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ initialTheme: 'light' }) });
    act(() => result.current.setMode('dark'));
    expect(result.current.mode).toBe('dark');
  });

  it('throws when useTheme is used outside ThemeProvider', () => {
    const Outside = () => {
      useTheme();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Outside />)).toThrow(/inside <ThemeProvider>/);
    consoleError.mockRestore();
  });

  it('survives a localStorage failure on read and write', async () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
      configurable: true,
    });

    const user = userEvent.setup();
    const Demo = () => {
      const { mode, toggleMode } = useTheme();
      return (
        <button type="button" onClick={toggleMode}>
          {mode}
        </button>
      );
    };
    render(
      <ThemeProvider initialTheme="light">
        <Demo />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();

    Object.defineProperty(window, 'localStorage', {
      value: original,
      configurable: true,
    });
  });
});
