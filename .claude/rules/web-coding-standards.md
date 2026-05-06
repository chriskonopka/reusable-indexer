# Coding Standards

## Error Handling

- Never let errors crash the UI. Use React error boundaries at route and feature boundaries to catch rendering failures gracefully.
- All `async` operations (API calls, IndexedDB, etc.) must have explicit error handling — no unhandled promise rejections.
- Show user-friendly error states, not raw error messages or blank screens.
- Do not silently swallow errors — always log them via the App Insights SDK (see `frontend-error-logging.md`).

## Naming Conventions

- Components: `PascalCase` — file and export name must match.
- Hooks: `camelCase` prefixed with `use` (e.g. `useTodos`).
- Constants: `UPPER_SNAKE_CASE`.
- Everything else: `camelCase`.
- Boolean variables/props: prefix with `is`, `has`, `should`, or `can`.
- Variables must be descriptive and self-documenting — single-letter variable names are not allowed (including loop counters such as `i`, `j`, `k`; use `index`, `rowIndex`, etc. instead).

## TypeScript Discipline

- No `any` without a justification comment explaining why it cannot be typed.
- No `@ts-ignore` or `@ts-expect-error` without a documented reason.
- No type assertions (`as`) unless necessary and commented.
- Props must be typed with explicit interfaces — not `React.FC`, not inline object types.
- Exhaustive switch statements in reducers: use a `never` type in the default case to catch unhandled actions at compile time.

## Code Hygiene

- No commented-out code — delete it or open an issue to track it.
- No `TODO` without a linked issue reference (e.g. `// TODO(#123): ...`).
- No magic numbers — extract constants with descriptive names.
- No `console.log` left in committed code — use proper error reporting.
- No `eslint-disable` without a justification comment on the same line.

## Import Ordering

Organize imports in this order, separated by blank lines:

1. External packages (e.g. `react`, `redux`)
2. Internal aliases / shared modules (e.g. `@/components`, `@/hooks`)
3. Relative imports (e.g. `./utils`, `../types`)
