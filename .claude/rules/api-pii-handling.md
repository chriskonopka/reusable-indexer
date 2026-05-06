# PII Handling

This rule is the project's baseline for handling personally identifiable
information. Project teams operating under stricter compliance regimes
(HIPAA, FedRAMP, sector-specific contracts) must extend this rule, not relax
it. If your project has a separate compliance document, that document
overrides this one — and the override should be recorded at the top of the
project-level `CLAUDE.md`.

## What counts as PII
Any value that on its own — or in combination with other fields in the same
log line, response, error message, or stored row — could identify a natural
person. This includes (non-exhaustively): name, email, phone, postal address,
IP address, government-issued IDs, account numbers, precise geolocation,
biometric data, photographs, free-text user input, AI prompts and AI
responses, document text, and client matter identifiers.

The Entra ID `sub` claim (object ID GUID) is treated as a pseudonymous
identifier and is the only user identifier permitted in logs. See
`api-logging.md` for the full rule.

## Where PII is allowed
- **Database** — user records, document records, conversation messages.
  Stored only in tables documented to hold PII; encrypted at rest (TDE);
  PII columns use Always Encrypted where the schema requires it (see
  `database/CLAUDE.md`).
- **Blob Storage** — uploaded documents, conversation message arrays.
  Encrypted at rest; access scoped via Managed Identity.
- **In-memory during a request** — for the duration of the request only.

## Where PII is forbidden
- **Logs** — application logs, request logs, exception logs, telemetry. The
  only user identifier permitted is the pseudonymous `UserId` (Entra `sub`).
  See `api-logging.md`.
- **Error responses to clients** — ProblemDetails `detail` fields must not
  echo back identifying values. Reference an internal correlation id
  (`OperationId`) instead.
- **AI provider requests** — except when the request is *itself* a user
  prompt or document (which is the entire point of the call). Never include
  PII in system prompts, tool descriptions, or metadata fields sent
  alongside the prompt.
- **Source control** — never commit fixtures, seed data, or test cases that
  contain real PII. Use synthetic data.
- **CI/CD logs and build artefacts**.

## Boundaries and scrubbing
- **Inbound** — at API boundary, validate and bind to typed DTOs. Do not log
  the raw request body.
- **Outbound to AI providers** — wrap calls so that any logged
  request/response excludes the body. The Serilog destructuring policy must
  treat known DTO types (`LlmRequest`, `LlmResponse`, `Document`,
  `ConversationMessage`) as non-loggable and emit `[REDACTED]`.
- **Outbound to monitoring** — exception details may include the exception
  type and stack trace; they must not include the inputs that triggered the
  exception unless those inputs are non-PII (e.g. an HTTP route, an enum, a
  GUID).
- **Outbound to clients** — see "Error responses" above.

## Subject-rights operations
The application must support data export and deletion requests under
GDPR Article 15/17 and CCPA. The canonical implementation is a stored
procedure (`usp_ExportUserData`, `usp_DeleteUserData`) — never an ad-hoc
script — so audit trail and soft-delete semantics stay correct.

## Reviewer checklist
- [ ] No new log statement adds a PII field
- [ ] No new error response echoes user input back unredacted
- [ ] No new AI provider call sends metadata that wasn't there before
- [ ] No new test fixture contains real PII
- [ ] Any new column that holds PII is documented as such in the migration
      and is encrypted per `database/CLAUDE.md`
