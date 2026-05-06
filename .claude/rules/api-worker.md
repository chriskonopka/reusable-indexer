# Worker & Service Bus Standards

## Document processing — Worker scope
The Worker owns all document processing after upload. The API always enqueues — the Worker decides whether to chunk.

- Worker receives a `DocumentIndexMessage` from Service Bus containing `blobPath`, `documentId`, `classificationTier`, `citationsEnabled`, `documentSetId`, and `batchId`
- Worker calls `DocumentExtractionSkill.ExtractAsync(blobPath, citationsEnabled, classificationTier, ct)` → `NormalisedDocument`
- Worker checks `NormalisedDocument.TokenCount` against the model context limit (retrieved at runtime — do not use a fixed threshold):
  - **Within limit** — persist extracted text to Blob Storage, store the blob path in SQL, set `HasVectorIndex = false`, update document status to `Ready`
  - **Exceeds limit** — run chunking → embeddings → build vector index, set `HasVectorIndex = true`, update document status to `Ready`
- Worker does **not** call the LLM and does **not** stream to the client — that happens in the API when the client sends a Q&A request
- Never duplicate extraction logic — `DocumentExtractionSkill` is the single extraction entry point

## Message handling
- Use peek-lock (`ServiceBusProcessorOptions.ReceiveMode = PeekLock`) — never receive-and-delete
- Call `CompleteMessageAsync()` only after all side effects have succeeded
- Call `AbandonMessageAsync()` on transient failures — lets the retry count increment naturally
- Call `DeadLetterMessageAsync()` on permanent failures (invalid message, unrecoverable processing error) — include a reason string
- Never swallow exceptions silently — unhandled exceptions must abandon the message

## Idempotency
- Every message handler must be idempotent — the same message may be delivered more than once
- Use the message `MessageId` as the idempotency key — check SQL before processing, skip and complete if already handled
- Record processing state in SQL (e.g. `ProcessedAt`, `Status`) before completing the message

## Cancellation
- Pass `CancellationToken` from `ProcessMessageEventArgs` through every downstream call
- On cancellation, abandon the message — do not complete or dead-letter

## Poison messages
- Azure Service Bus dead-letters automatically after `MaxDeliveryCount` retries — do not reimplement this manually
- Set `MaxDeliveryCount` explicitly in infrastructure — do not rely on the default
- Dead-letter queue must be monitored — alert on non-zero depth

## Retry policy
- HTTP-level retry of transient failures (429/5xx) is handled by the Azure SDKs in use (Service Bus, Blob, Document Intelligence, etc.) per `api-performance.md`'s outbound-throttling rule — do not wrap them in additional retry logic.
- After SDK-level retries are exhausted and the call still fails: call `AbandonMessageAsync()` so Service Bus's `MaxDeliveryCount` handles eventual dead-lettering.
- On permanent failure (400/401/403, business-rule violations, malformed messages): call `DeadLetterMessageAsync()` immediately — do not waste redelivery cycles on something that will never succeed.

## Worker lifecycle
- Register processors in `IHostedService` — start in `StartAsync`, stop and dispose in `StopAsync`
- Max concurrent calls must be sized against downstream capacity — do not set without knowing what the target service can absorb
- Log `MessageId` as a structured field on every log statement inside a handler
