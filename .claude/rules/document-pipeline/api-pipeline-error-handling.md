# Error Handling — Document Processing Pipeline

## Retry policy
- Retry handling for all external calls (ADI, OpenAI, Claude, Blob Storage, SQL) follows the outbound-throttling rule in `api-performance.md` — prefer SDK built-in retry; if absent, register the HttpClient with `AddStandardResilienceHandler()`.
- Pipeline-specific addition: on permanent failure (400/401/403, exhausted retries, etc.) update the document's SQL status to `Failed` and return gracefully without rethrowing — the batch must continue processing other documents.

## Failure rules
- Never fall back silently on failure (e.g. do not call the LLM without history if history load fails, do not skip chunking if embedding fails).
- Once a stream has started, do not retry mid-stream — emit an `error` SSE event and close cleanly.
