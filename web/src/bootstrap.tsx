import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { IndexerApp } from './IndexerApp';
import { createStubHost } from './host/stubHost';
import { installStubFetch, isStubModeRequested } from './host/stubFetch';

// Standalone dev shell. In Module Federation deployments the consuming app
// imports `./IndexerApp` directly and supplies its own host contract;
// bootstrap.tsx is only used by `npm run dev` and the Playwright e2e suite.
//
// `main.tsx` does an async `import('./bootstrap')` so webpack can resolve
// the shared singleton scope (react, react-dom) before any React code runs.
// This is the standard MF async-boundary pattern.
//
// When the URL contains `?stub=1`, the indexer installs an in-memory fetch
// shim so e2e flows can run without a live backend. Production builds
// served from a real consumer never see this flag — it is dev-only.

if (isStubModeRequested()) {
  installStubFetch();
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure <div id="root"> exists in index.html.');
}

// Expose recorded host events on window so Playwright can assert on them.
const recordedEvents: unknown[] = [];
declare global {
  interface Window {
    __indexerEvents?: unknown[];
  }
}
window.__indexerEvents = recordedEvents;

const host = createStubHost();
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
