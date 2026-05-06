# Performance

- **Theme initialisation must use an inline `<script>` in `<head>`**, not a `useEffect` or `useState` initializer — prevents flash of wrong colour scheme.
- **Build output must split the React vendor chunk** from application code via webpack's `splitChunks.cacheGroups`.
- **Strip `console.*` and `debugger` statements** from production builds using Terser's `drop_console` and `drop_debugger` options.
- **Measure performance against a production build** (`npm run build && npm run preview`), not the dev server.
- **Avoid side effects in `useState` initialisers** — they run during the render phase.
- **Lazy load route-level components** with `React.lazy()` + `Suspense`. Large feature modules should be dynamically imported.
- **Memoize expensive computations** — React Compiler handles this automatically when enabled. Otherwise, filtering, sorting, or transforming large datasets should use `useMemo`.
- **Use path/named imports for tree-shaking** — `import debounce from 'lodash/debounce'`, not `import _ from 'lodash'`.
