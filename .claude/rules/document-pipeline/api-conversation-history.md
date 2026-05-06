# Conversation History — .claude/conversation-history.md
> See `api/CLAUDE.md` for pipeline overview

## Message schema
Each entry in the Blob JSON array is a `ConversationMessage`:
```json
{ "id": "uuid-v4", "role": "user" | "assistant", "content": "string", "timestamp": "ISO 8601 UTC" }
```
Never store partial messages or system prompts — system prompts are reconstructed at call time.

## Storage split
Metadata (`Id`, `UserId`, `Title`, `Status`, `MessageCount`, `LastMessageAt`) → Azure SQL.
Full message array → Blob Storage at `/conversations/{userId}/{conversationId}/messages.json`.

## Active document set
Tracked in `ConversationDocuments` (SQL): `ConversationId`, `DocumentId`, `AddedAt`, `RemovedAt`.
- Add document: insert row with `RemovedAt = null`. Remove: set `RemovedAt = now` — never delete rows.
- Query before every LLM call: `SELECT DocumentId FROM ConversationDocuments WHERE ConversationId = @id AND RemovedAt IS NULL`
- Pass result to `LlmRoutingSkill` alongside history.

## Creating a new conversation
`ConversationHistorySkill.CreateAsync(userId, title, ct)` → `conversationId`
1. Insert SQL row: `Status = "Active"`, `MessageCount = 0`, `LastMessageAt = now`.
2. Create blob at the path above with content `[]` — create eagerly, never defer.

## Loading
`ConversationHistorySkill.LoadAsync(conversationId, ct)` → `(Messages, ETag, ActiveDocumentIds)`

All three (SQL metadata, blob messages, active documents) are required before every LLM call.
- SQL not found → throw `ConversationNotFoundException`.
- Blob 404 → throw (data integrity error — blob must exist after `CreateAsync`).
- Any other storage error → throw. Never call the LLM without history.

Return ETag — required for safe appending.

## History size — history-trim budget
This is **not** the LLM-routing threshold (that one comes from the model's
context window — see `api-llm-auth.md`). This is a separate, history-specific
trimming budget applied before building the prompt.

Trim history to whichever hits first: the last **50 messages** or **8,000 tokens**
(template defaults — tune per project based on the LLM's context window, the
project's conversation length distribution, and cost targets).
Estimate tokens via provider SDK (OpenAI `tiktoken` / Claude token counting endpoint).
Truncate from the oldest end. Do not summarize. Pass the trimmed list to
`LlmRoutingSkill` — never the raw full list.

## Appending after each response
`ConversationHistorySkill.AppendAsync(conversationId, userMessage, assistantMessage, eTag, ct)`
1. Append user then assistant `ConversationMessage` to the blob array.
2. Upload with `If-Match: {eTag}`. On 412: reload, re-append, retry once — throw if still failing.
3. On success, update `MessageCount` and `LastMessageAt` in SQL.

Only append after a complete successful response. On stream failure, skip `AppendAsync` entirely —
history stays unchanged and the client retries from its own state.
