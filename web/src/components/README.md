# components/

Cross-feature shared UI primitives. Tier 3 in the dependency graph.

## What belongs here

The primitives listed in `docs/architecture/shared-inventory.md` §2:

- `Button` — only sanctioned button. Primary / Secondary variants per `web-branding.md`.
- `IconButton` — Phosphor outline icon in a 24×24 hit area.
- `Pill` — file-type and status pills with text labels (never colour-only).
- `Modal` — accessible dialog with focus trap, return-focus on close, Escape to close.
- `Toast` — non-blocking toast viewport.
- `EmptyState` — empty-state primitive used by collections, file list, etc.
- `Skeleton` — loading placeholder.
- `ErrorBoundary` — catches render-phase errors.

## What does not belong here

- Components used by only one feature — those live in `features/<x>/components/`.
- Components that own significant business logic — keep primitives presentational.
- Hard-coded colours or fonts — use the theme tokens via CSS custom properties.
- Filled Phosphor icons. Outline only per `web-branding.md`.

## Adding a new primitive

If two or more features need the same component, add it here and add a row to `shared-inventory.md` §2 first. Inventing a primitive without updating the inventory is a contract violation.
