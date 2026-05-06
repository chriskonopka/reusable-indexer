# utils/

Pure functions only — no React, no side effects, no DOM. Tier 1 in the dependency graph (`docs/architecture/dependency-graph.md`).

## What belongs here

The cross-cutting utilities listed in `docs/architecture/shared-inventory.md` §1:

- `normalizeError` — wire error / ProblemDetails → stable UI shape
- `dateLabels` — relative-time labels for the file table and progress banner
- `junkFileFilter` — strips OS junk before upload
- `fileTypeFilter` — classifies an upload as supported / unsupported / too-large / empty
- `folderPath` — walks a dropped folder tree and resolves the target folderId
- `idb` — the only IndexedDB wrapper in the codebase

## What does not belong here

- React components or hooks — those go to `components/` and `hooks/`.
- Anything that imports from `api/`, `host/`, or `theme/` — utils sit below those tiers in `dependency-graph.md` and may not depend on them.
- Stateful modules (singletons that hold mutable state across calls).
- Anything tied to a specific feature — that goes inside `features/<x>/`.

## Adding a new util

If two or more features need the same pure helper, add it here and add a row to `shared-inventory.md` §1. Inventing a new util without updating the inventory is a contract violation.
