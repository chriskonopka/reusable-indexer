# Document Processing — Skill Guidelines

## Tests — applies to all files
Mock all external dependencies (ADI, LLM providers, Blob Storage, SQL). Every public method needs:
happy path, retryable failure (verifies retry count), permanent failure (verifies no rethrow), and
every conditional branch described in the relevant detail file.

## Required test cases for every skill
- **Happy path** — valid inputs, assert expected output and that downstream dependencies were called with correct arguments
- **Retryable failure (429/5xx)** — mock the external call to throw on the first N attempts, succeed on the last; assert retry count equals 3 and final result is correct
- **Permanent failure (400/401/403)** — mock the external call to throw once; assert no retry occurs and no exception is rethrown
- **Cancellation** — pass a cancelled `CancellationToken`; assert the method exits cleanly without calling external dependencies
- **CitationsEnabled = true / false** — assert correct prompt construction and downstream citation calls for each branch
- **Token routing-threshold boundary** — the routing threshold is the selected model's context window limit (read at runtime from provider metadata; see `api-llm-auth.md`). Mock the model metadata to a fixed value, then test `doc.TokenCount` at exactly that limit, one below, and one above; assert the correct routing path is taken. Do not hardcode a numeric threshold in tests.
- **Empty conversation history** — assert the LLM is still called and history is passed as an empty list, not omitted
- **Null / missing document** — assert Path 1 (question-only) is taken and no extraction call is made
- **Partial extraction** — assert `PartiallyCompleted` status, failed pages skipped, next stage still triggered
- **Active document set** — assert only documents with `RemovedAt = null` are included in the LLM call
- **Stream interruption** — assert `error` SSE event emitted and stream closed cleanly on LLM failure
