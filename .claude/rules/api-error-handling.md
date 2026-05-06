# Error Handling Standards

## Global exception middleware
- Register a single global exception handler via `UseExceptionHandler` — no per-controller try/catch for unhandled exceptions
- All unhandled exceptions map to `500` ProblemDetails with a generic `detail` message — never expose the original exception message or stack trace
- Log the full exception at `Error` level with `OperationId` before returning the response

## HTTP status mapping
| Scenario | Status |
|---|---|
| Validation failure (bad input) | 400 |
| Invalid or missing auth token | 401 |
| Valid token, insufficient permissions | 403 |
| Resource not found | 404 |
| Conflict (duplicate, state violation) | 409 |
| Unhandled exception | 500 |
| Upstream service unavailable after retries | 503 |

## Validation failures
- Return `400` with ProblemDetails — set `errors` extension field to a dictionary of field → message
- Validate at the controller boundary before calling any service
- Never throw exceptions for expected validation failures — return `ValidationProblem()` directly

## Not found
- Return `404 NotFound()` — do not throw `KeyNotFoundException` or similar and let middleware catch it
- Soft-deleted records are treated as not found — never expose `IsDeleted` in error responses

## Do not
- Do not use exception filters as the primary error handling mechanism
- Do not catch and rethrow the same exception — handle it or let it propagate
- Do not return `200` with an error payload — always use the correct HTTP status
- Do not return an empty error response — every error returns ProblemDetails with a populated `detail` field
