# Component Architecture

- One component per file; filename matches the component name (PascalCase).
- Keep components small and single-responsibility.
- Separate concerns: data fetching in hooks or parent containers, pure rendering in presentational components.
- Colocate related files: `ComponentName/index.tsx`, `ComponentName.module.css`, `ComponentName.test.tsx`.
- Export components as named exports; use default exports only at page/route boundaries.
- Avoid prop drilling beyond 2 levels — use Context or lift state appropriately.
- Prefer React Compiler for automatic memoization. When React Compiler is not available, `React.memo` and `useCallback` must always be used together on list-item components. Define the component as a named const first, then export the memoised version for DevTools compatibility.
- Private sub-components used only within one parent file may be defined in the same file above the main export.
- Use `crypto.randomUUID()` for client-side ID generation. Do not install `uuid`, `nanoid`, or similar libraries.
- Enumerable UI options that drive a rendered list (e.g. filter buttons) must be defined as a typed module-level constant, not inline JSX.

## useEffect & Cleanup

- Event listeners (`addEventListener`), subscriptions, and timers (`setInterval`, `setTimeout`) added in `useEffect` must be cleaned up in the return function.
- Store interval/timeout IDs so they can be cleared on unmount.
- `fetch` calls in `useEffect` must use `AbortController` to cancel in-flight requests when the component unmounts or dependencies change. When a dependency changes and triggers a new fetch, the previous response must be ignored.
- Avoid stale closures in event handlers and callbacks — use refs (`useRef`) or functional state updates (`setState(prev => ...)`) when the callback needs the latest value.

## Rendering Performance

- `useEffect`, `useCallback`, and `useMemo` must list all referenced variables in their dependency arrays. Never suppress the exhaustive-deps lint rule without a documented reason.
- Values that can be computed from existing state/props must be calculated inline during render, not synced via `useEffect` (no derived-state-in-effect).
- Do not pass inline object or array literals as JSX props (e.g. `style={{...}}`, `options={[...]}`). Extract to a module-level constant or memoize with `useMemo`. React Compiler handles this automatically when enabled.
