# Architecture index

Locked contracts and decisions for the reusable indexer SPA. Read these before planning, scaffolding, or implementing — they are the inputs to every later step.

| Doc | Step | What it covers |
|---|---|---|
| [data-model.md](./data-model.md) | 1 | Entities, computed fields, persistence rules, the full Conflict Log (C1–C12). |
| [api-contracts.md](./api-contracts.md) | 1 | Endpoints the indexer consumes, error-slug mapping, polling cadence, the endpoints intentionally **not** consumed (chat, viewer, content streaming). |
| [module-boundaries.md](./module-boundaries.md) | 1 | Module Federation surface, host contract (props + events + `IndexerHandle`), internal feature layout. |
| [shared-types.md](./shared-types.md) | 1 | Index for `/shared/types/`. |
| [dependency-graph.md](./dependency-graph.md) | 1 | Tier model, per-module imports, acyclicity proof. |
| [shared-inventory.md](./shared-inventory.md) | 1 | Cross-cutting utilities, primitives, hooks, infra helpers. Status updated at scaffold. |
| [slice-plan.md](./slice-plan.md) | 1 | Capability-to-slice map, per-slice scope, drift cap. |
| [scaffold-notes.md](./scaffold-notes.md) | 2 | Decisions and clarifications surfaced while standing up the empty skeleton. |
| [01-slice-shell-collections.md](./01-slice-shell-collections.md) | 3 (slice 1) | Indexer shell, theme, and collections — capability sentence, layers changed, gates/coverage outcome, decisions. |
| [02-slice-folders-filelist.md](./02-slice-folders-filelist.md) | 3 (slice 2) | Folders and file list — folder tree CRUD/DnD, file table, properties panel, `document/selected` event, `revealDocument` handle. |
| [03-slice-upload.md](./03-slice-upload.md) | 3 (slice 3) | Upload pipeline — drag-drop / picker / folder walk, sliding-window concurrency, batch lifecycle, status polling, per-folder aggregate, progress banner, failure triage popover, browser-close guard. |
| [04-slice-readonly-responsive-a11y.md](./04-slice-readonly-responsive-a11y.md) | 3 (slice 4) | Read-only sweep verification, responsive layout (desktop / tablet / mobile with hamburger overlay), keyboard pass (banner Escape), ARIA tooltips on truncated names, three new Playwright e2e suites (accessibility, responsive, read-only). |

## Authoritative external sources

- `/DocCollectionChat_BUSINESS_REQUIREMENTS_FRONTEND.md` — product spec.
- `/frontend-api-contract.md` — wire-level API contract.
- `/.claude/rules/` — engineering rules; specific files referenced inline by each doc.

## Locked signatures

The following do not move without an architecture-doc update **and** a re-review:

- `IndexerAppProps`, `IndexerEvent`, `IndexerHandle`, `ThemeTokenKey` in `/shared/types/host-contract.ts`.
- The four exposed Module Federation paths and feature folder names in `module-boundaries.md` §1.3 / §3.
- The slice plan's slice count and ceiling in `slice-plan.md`.
