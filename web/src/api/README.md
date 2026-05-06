# api/

HTTP client. Tier 2 in the dependency graph.

## What belongs here

- `client.ts` — the single fetch wrapper. Bearer-token attachment, OperationId capture, ProblemDetails parsing, `auth/expired` emission on 401.
- `queryKeys.ts` — the registry of TanStack Query keys.
- `endpoints/<resource>.ts` — typed query/mutation hooks per resource. One file per resource (collections, folders, documents). Added per slice.

## What does not belong here

- Anything that imports from `features/*` — features consume the API client, never the other way round.
- SSE / streaming wrappers — chat is the consuming application's concern. The indexer itself does not stream.
- Document-content streaming. The indexer never calls `GET /documents/{id}/content`; the consuming app's viewer does.
- React components or feature hooks — those live in `components/` and `features/<x>/`.

## Notes

The fetch wrapper reads `apiBaseUrl` and `getAccessToken` from the host contract via `host/useHost.ts` (through `hooks/useApiClient.ts`). It must not import directly from features and must never attempt to refresh tokens — refresh is the host's responsibility.
