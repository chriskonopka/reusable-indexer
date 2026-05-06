// Module Federation requires an async boundary at the entry so the runtime
// can resolve the shared singleton scope (react, react-dom) before any React
// code runs. Keep this file tiny — all real bootstrapping lives in bootstrap.tsx.

import('./bootstrap').catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Indexer bootstrap failed', error);
});
