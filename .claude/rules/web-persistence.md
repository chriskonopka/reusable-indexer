# Client-Side Persistence

User-generated state must survive a page refresh. Do not leave state ephemeral unless it is intentionally transient (e.g., a modal open/close flag).

## IndexedDB (primary persistence store)

- Use **IndexedDB** via the shared `usePersistedReducer` hook (`src/hooks/usePersistedReducer.ts`) and helpers in `src/utils/idb.ts`. Never call `indexedDB` directly in components or hooks.
- Use a **stable, namespaced key** per feature (e.g. `'todo-list'`). Define keys as constants, not inline strings.
- Do not assume state is fully hydrated on the first render — IndexedDB is async, so the app renders with `initialState` first.
- Handle IndexedDB errors silently with `.catch()` — storage can be unavailable. Fall back to `initialState` gracefully.
- When the stored schema changes, handle migration or clear stale data on read rather than crashing.

## localStorage (theme preference only)

- `localStorage` is used **exclusively** for the `theme-preference` key — the inline `<script>` in `index.html` must read it synchronously before the first paint.
- Do not use `localStorage` for any other state. All other persistent state goes through IndexedDB via `usePersistedReducer`.
- Always wrap `localStorage` access in `try/catch`.

## Security

- Never store sensitive data (tokens, passwords, PII) in IndexedDB or localStorage — use httpOnly cookies.
