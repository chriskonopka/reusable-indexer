# Logging Standards

## General (Serilog)
- Serilog with `Serilog.Sinks.ApplicationInsights` (production) + `Serilog.Sinks.Console` (always included — useful for container stdout capture and local dev)
- Use `APPLICATIONINSIGHTS_CONNECTION_STRING` — not the legacy instrumentation key
- Required structured properties on every log entry: `UserId`, `OperationId`
- Log levels:
  - `Debug` — internals (only on in dev)
  - `Information` — normal operational events (request received, handler completed, external call succeeded)
  - `Warning` — unexpected but handled (retryable failure, slow downstream, fallback used)
  - `Error` — failures that affect a single request (caught exception, validation infrastructure failure)
  - `Critical` — platform broken (data loss, dependency unavailable, host shutdown)
- Never log: user input, AI responses, client matter identifiers, or any direct PII (name, email, phone, address, IP, etc.)

### UserId is a pseudonymous identifier — not PII
The `UserId` field on log entries is the user's stable opaque identifier — the Entra ID `sub` claim (object ID GUID). Never substitute or supplement it with email, username, display name, or any other directly identifying value. Treated this way, `UserId` is a pseudonym under GDPR/CCPA — it is the project's pseudonymization clause, and it is the only user identifier permitted in logs. If a future requirement demands stronger separation (e.g. salted hash so logs cannot be cross-referenced with the directory without the salt), update this rule before the implementation lands; do not improvise per call site.

## OperationId — correlation across services
- OperationId middleware is the **first** pipeline item (before authentication, authorization, routing) — generates the ID, pushes it to Serilog `LogContext`, and echoes it on the response header
- The standard header name is `X-Operation-Id` — do not rename
- Carry `OperationId` across queue messages and internal HTTP calls via the `X-Operation-Id` header — preserves a single correlation ID across API → Worker → downstream service
- Workers do **not** use the OperationId middleware — they restore the OperationId from the incoming message's `ApplicationProperties` and push it to `LogContext` themselves
- Do not forward `OperationId` to external third-party services (OpenAI, Stripe, etc.) — internal correlation IDs must not leak outside the system boundary

## Document Processing Pipeline
- Always include `DocumentId` and `ClassificationTier` as structured fields on every log statement.
- Log `[RESTRICTED]` instead of the tier label for `HighlyConfidential` documents.
- Log start, completion, and `DurationMs` for every external service call at `Information`.
- Log retry attempts at `Warning` with `RetryAttempt` and the error status.
- Never log document text, message content, or prompt content at any log level.
