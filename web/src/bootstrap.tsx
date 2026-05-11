import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { IndexerApp } from './IndexerApp';
import { createStubHost } from './host/stubHost';
import { createRealHost } from './host/realHost';
import { installStubFetch, isStubModeRequested } from './host/stubFetch';

// Standalone dev shell. In Module Federation deployments the consuming app
// imports `./IndexerApp` directly and supplies its own host contract;
// bootstrap.tsx is only used by `npm run dev` and the Playwright e2e suite.
//
// `main.tsx` does an async `import('./bootstrap')` so webpack can resolve
// the shared singleton scope (react, react-dom) before any React code runs.
// This is the standard MF async-boundary pattern.
//
// Three URL modes:
//   - default       : stub host (no real auth, no real API calls — layout work only).
//   - ?stub=1       : stub host + in-memory fetch shim (e2e suite).
//   - ?real=1       : real MSAL host against the live GlobalIndexer API
//                     (shake-down / integration validation).

declare global {
  interface Window {
    __indexerEvents?: unknown[];
  }
}

// Real-mode persists across the MSAL redirect cycle. Entra returns to the
// registered redirect URI (`http://localhost:5174/`) and appends the auth
// code as a URL fragment — the original `?real=1` query string is dropped.
// sessionStorage carries the choice through the round trip.
const REAL_MODE_KEY = 'mws_indexer_real_mode';

const isRealModeRequested = (): boolean => {
  const params = new URLSearchParams(window.location.search);

  // Explicit stub mode wins and clears any persistent real-mode flag.
  if (params.has('stub')) {
    sessionStorage.removeItem(REAL_MODE_KEY);
    return false;
  }

  // Explicit real mode sets persistent flag for the redirect round trip.
  if (params.has('real')) {
    sessionStorage.setItem(REAL_MODE_KEY, '1');
    return true;
  }

  // Fall back to persistent flag (the MSAL redirect-back path).
  return sessionStorage.getItem(REAL_MODE_KEY) === '1';
};

const initializeAndRender = async (): Promise<void> => {
  const useRealHost = isRealModeRequested();

  if (!useRealHost && isStubModeRequested()) {
    installStubFetch();
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found. Ensure <div id="root"> exists in index.html.');
  }

  const recordedEvents: unknown[] = [];
  window.__indexerEvents = recordedEvents;

  const host = useRealHost
    ? await createRealHost({ clientId: process.env.MSAL_CLIENT_ID || '' })
    : createStubHost();

  createRoot(rootElement).render(
    <StrictMode>
      <IndexerApp
        {...host}
        onEvent={(event) => {
          recordedEvents.push(event);
          host.onEvent?.(event);
        }}
      />
    </StrictMode>,
  );
};

void initializeAndRender();
