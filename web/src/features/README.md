# features/

Vertical slices of the indexer. Tier 5 — the topmost runtime tier.

## What belongs here

One folder per in-scope feature, per `docs/architecture/module-boundaries.md` §3.2:

- `collections/` — sidebar, CRUD, share dialog (slice S1)
- `folders/` — tree, CRUD, drop targets (slice S2)
- `fileList/` — table, filters, search, bulk select, properties panel (slice S2)
- `upload/` — drag-drop, batch, polling, banner, triage (slice S3)

Each feature owns its own:

- `components/` — UI scoped to this feature
- `hooks/` — feature-local hooks
- `types.ts` — feature-local types (if non-trivial)
- `utils.ts` — feature-local helpers
- `index.ts` — the **only** public surface; everything else is private to the feature

## What does not belong here

- Cross-feature primitives — those live in `web/src/components/`.
- Cross-feature hooks — those live in `web/src/hooks/`.
- Pure utilities used by 2+ features — those live in `web/src/utils/`.
- Imports between features. A feature must not deep-import from another feature; if two features need the same code, hoist it into a higher tier.

## Notes

Feature folders for chat, viewer, and citations are intentionally absent — those are the consuming application's responsibility, not this indexer's. The host contract (`/shared/types/host-contract.ts`) is how the consuming app composes those features on top.
