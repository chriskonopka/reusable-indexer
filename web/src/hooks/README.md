# hooks/

Cross-feature shared hooks. Tier 3 in the dependency graph.

## What belongs here

The hooks listed in `docs/architecture/shared-inventory.md` §3:

- `usePersistedReducer` — IndexedDB-backed reducer (the only sanctioned IDB-persistence path).
- `useApiClient` — the React-side entry point to the HTTP client.
- `usePolling` — visibility-aware polling for batch + document status.
- `useDebouncedValue` — debounce a changing input value.
- `useFocusTrap` — modal accessibility.
- `useKeyboardEscape` — Escape-key handler.
- `useToast` — toast queue + push API.

## What does not belong here

- Hooks used by only one feature — those live in `features/<x>/hooks/`.
- Anything that imports from `features/*` — hooks sit below features in the dependency graph.
- Pure utilities (no React) — those go to `utils/`.

## Adding a new hook

If two or more features need the same hook, add it here and add a row to `shared-inventory.md` §3 first. Inventing a hook without updating the inventory is a contract violation.
