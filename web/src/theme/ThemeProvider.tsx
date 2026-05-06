import {
  CSSProperties,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ThemeTokenKey } from '@shared/types';
import { INDEXER_THEME_TOKENS_DARK, INDEXER_THEME_TOKENS_LIGHT } from './tokens';

// Applies CSS custom properties to a scoped wrapper, mirrors data-theme to
// <html> so global selectors (focus rings, branding rules) work, and
// persists the active mode to localStorage for the inline pre-paint script
// to read on next load. See web-styling.md, web-branding.md, web-persistence.md.

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme-preference';

const readPersistedMode = (): ThemeMode | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // localStorage may be denied (e.g. Safari private mode).
  }
  return null;
};

const detectSystemMode = (): ThemeMode => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface ThemeProviderProps {
  initialTheme?: ThemeMode;
  overrides?: Partial<Record<ThemeTokenKey, string>>;
  children: ReactNode;
}

export const ThemeProvider = ({
  initialTheme,
  overrides,
  children,
}: ThemeProviderProps) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (initialTheme) return initialTheme;
    return readPersistedMode() ?? detectSystemMode();
  });

  const tokens = useMemo(() => {
    const base = mode === 'dark' ? INDEXER_THEME_TOKENS_DARK : INDEXER_THEME_TOKENS_LIGHT;
    return { ...base, ...(overrides ?? {}) };
  }, [mode, overrides]);

  const style = useMemo(() => {
    const cssVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(tokens)) {
      cssVars[`--${key}`] = value;
    }
    return cssVars as CSSProperties;
  }, [tokens]);

  // Reflect data-theme on <html> + persist the current mode.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage denied — runtime preference still applies for this session.
    }
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div data-indexer-theme={mode} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be called inside <ThemeProvider>.');
  }
  return value;
};
