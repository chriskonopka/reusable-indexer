# host/

Host-contract glue. Tier 2 in the dependency graph.

## What belongs here

- `HostContext.tsx` — the React Context that carries the IndexerAppProps the host passed in.
- `useHost.ts` — the only sanctioned reader of the host contract from inside the indexer.
- `stubHost.ts` — a fake host used by `npm run dev` to boot standalone. Never imported by production code.
- `types.ts` — ergonomic re-export of `/shared/types/host-contract.ts`.

## What does not belong here

- API calls, fetch wrappers, or anything that talks to the network — those live in `api/`.
- Theming logic — that lives in `theme/`.
- Imports from `features/*` — features depend on `host/`, never the reverse.
- Any file outside this directory may **not** import `/shared/types/host-contract` directly. Go through `useHost.ts` so the contract has a single read path.

## Notes

The host contract is the public surface of the Module Federation remote. Changing any field, event variant, or `IndexerHandle` method is a breaking change to every consuming app — update `docs/architecture/module-boundaries.md` and re-review before editing.
