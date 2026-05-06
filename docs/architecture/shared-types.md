# Shared Types — Index

The reusable indexer's shared types live in `/shared/types/` and are the single source of truth every layer (API client, hooks, components, tests, the host application) speaks. Anything new added here must trace back to a requirement in the requirements doc or a contract in `frontend-api-contract.md`.

The types here cover the indexer's scope only — ingestion + collection management. Chat, citation, conversation, and SSE types are intentionally absent because those endpoints are the consuming application's concern, not the indexer's.

## File layout

| File | Purpose |
|---|---|
| [`/shared/types/api.ts`](../../shared/types/api.ts) | Wire DTOs — request/response shapes for the endpoints the indexer consumes (collections, folders, documents metadata + status, batches, sharing, user lookup). No domain logic, no UI labels. |
| [`/shared/types/domain.ts`](../../shared/types/domain.ts) | UI-facing types computed/derived from wire DTOs (display labels, normalized folder tree, upload session). |
| [`/shared/types/host-contract.ts`](../../shared/types/host-contract.ts) | Module Federation host contract — props, events (`IndexerEvent`), and the imperative ref API (`IndexerHandle`) the consuming app uses to compose chat / viewer / citations on top of the indexer. |
| [`/shared/types/index.ts`](../../shared/types/index.ts) | Barrel re-export. Consumers import from here. |

## Authoring rules

- **Wire DTOs** in `api.ts` mirror the wire contract field-for-field, but only for the endpoints the indexer calls. If the contract changes, update this file FIRST, then call sites — not vice versa.
- **Domain types** in `domain.ts` may *narrow* (e.g., a 7-state `FileDisplayStatus` derived from the API's 4-state `DocumentStatus`) but never invent fields the wire doesn't provide. If a feature needs more, surface it as a Conflict Log entry and propose an API extension.
- **Host contract types** in `host-contract.ts` are public surface. A breaking change here forces every consuming app to update — handle as a coordinated breaking change per `api/CLAUDE.md` ("breaking changes are coordinated, not versioned").
- **No runtime code** in `/shared/types/`. Types only. Constants and helpers go to `/shared/utils/` (introduced in Step 2 if needed).

## Consumer rules

- Import only from the `index.ts` barrel: `import type { Collection, IndexerAppProps, IndexerHandle } from '@shared/types';`
- The TypeScript path alias `@shared/*` is configured in S1 against `/shared/*`. Until then, import paths are relative.
- Do not re-export shared types from feature `index.ts` files — features depend on types but do not own them.

## Coverage of in-scope spec entities

| Spec / contract entity | Shared type | File |
|---|---|---|
| Collection (UI label) / DocumentSet (wire) | `Collection`, `DocumentSetResponse`, `DocumentSetSummary` | `domain.ts`, `api.ts` |
| Folder + tree | `FolderNode`, `FolderResponse`, `FolderTreeResponse`, `FolderTreeNode` | `domain.ts`, `api.ts` |
| Folder aggregate status (spec 3.5.2) | `FolderAggregateStatus` | `domain.ts` |
| Document row | `DocumentRow`, `DocumentMetadataResponse`, `DocumentStatusResponse` | `domain.ts`, `api.ts` |
| File-display status (spec 3.5.1) | `FileDisplayStatus` | `domain.ts` |
| Upload session | `UploadFile`, `UploadSessionState` | `domain.ts` |
| Batch | `BatchResponse`, `BatchStatus`, `BatchStatusResponse`, `BatchStatusDocument` | `api.ts` |
| Share | `ShareResponse`, `GrantShareRequest` | `api.ts` |
| User lookup | `UserLookupResponse`, `UserLookupRequest` | `api.ts` |
| Error envelope | `ProblemDetails` | `api.ts` |
| Pagination | `Paged`, `PagedRequest` | `api.ts` |
| Host contract — props | `IndexerAppProps`, `IndexerInitialState`, `ThemeTokenKey` | `host-contract.ts` |
| Host contract — outbound events | `IndexerEvent` (auth-expired, collection-activated, collection-list-changed, document-selected, error-unhandled) | `host-contract.ts` |
| Host contract — imperative API | `IndexerHandle` (selectCollection, revealDocument) | `host-contract.ts` |

## Out of scope

The following types are **not** in `/shared/types/` because the corresponding endpoints / features are the consuming application's concern:

- Chat / SSE event types (`SseEventPayload`, `SseTokenEvent`, `SseCitationEvent`, `SseErrorEvent`)
- Conversation DTOs (`ConversationResponse`, `ConversationSummary`, `ConversationHistoryResponse`, `ConversationMessageDto`)
- Send-message request (`SendMessageRequest`, `LlmProvider`)
- Citation DTO (`CitationDto`)
- Viewer-related domain types (`ViewerCitationHighlight`, `ViewerRenderStrategy`)
- Chat session domain types (`ChatMessage`, `ChatSessionState`, `ChatMessageRole`)

The consuming app generates these from `frontend-api-contract.md` independently.
