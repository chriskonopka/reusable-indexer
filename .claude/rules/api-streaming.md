# Streaming — .claude/streaming.md

> `llm-auth.md` for LLM setup · `citations.md` only if document citations are enabled

## When this rule applies

This rule applies to any endpoint that streams LLM tokens to the client over SSE. Citation
events (described below) apply **only** if your project has document citations enabled — i.e.
`citations.md` is present in `.claude/rules/`. If citations are not in scope, implement only
the `token` and `error` events and ignore the citation sections.

## SSE response format

Use `Content-Type: text/event-stream`. Required event types:

- `event: token` → `{"text": "..."}` — yield as each token arrives, never buffer first
- `event: error` → `{"message": "Stream interrupted"}` — on LLM stream failure

Optional event type (only when document citations are enabled):

- `event: citation` → `{"marker": 1, "page": 1, "x": 72, "y": 341, "w": 449, "h": 17}`

## Citation events (only when citations are enabled)

Skip this section entirely if `.claude/rules/citations.md` is absent — there are no citations
to emit. Otherwise: detect `[cite:N]` markers in the token buffer as tokens arrive. Emit the
citation event immediately when detected — do not wait for the full response.

## Failure and disconnection

If the client disconnects (`CancellationToken` cancelled), stop and release resources cleanly.
If the LLM stream throws mid-response, emit an `error` event and close — do not rethrow.
Retry applies before streaming starts only (see `llm-auth.md`) — never retry mid-stream.
