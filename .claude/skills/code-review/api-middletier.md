# Middle Tier Code Review Checklist — .NET / Azure

---

## Basic Code Review

### API Standards

- Every API must implement a `GET /health` endpoint — required for App Service health checks
- No API versioning — breaking changes are coordinated, not versioned
- CORS configured with environment-driven allowed origins — never hardcoded
- Prefer POST with JSON body over GET with query strings — exceptions: simple ID lookups and health endpoint
- No sensitive or complex parameters in query strings — use a request body

### Error Responses

- All errors return a ProblemDetails response (RFC 7807)
- `detail` field must contain a plain-language explanation suitable for UI display
- Never return an empty error response
- Never expose stack traces, internal exception messages, or infrastructure details
- Correct HTTP status codes:

| Situation | Status |
|---|---|
| Validation failure | 400 Bad Request |
| Not authenticated | 401 Unauthorized |
| Authenticated but not allowed | 403 Forbidden |
| Resource not found | 404 Not Found |
| Unhandled server error | 500 Internal Server Error |

### Pagination

- Any endpoint returning a collection must be paginated — no unbounded lists
- Pagination parameters in POST request body: `{ "page": 1, "pageSize": 20, "filters": {} }`
- Response must include: `{ "items": [...], "totalCount": 0, "page": 1, "pageSize": 20 }`
- Default page size: 20. Maximum: 100. Requests above 100 rejected with 400.
- Exception: small bounded reference data (lookup values, status codes) — use judgement

### Request Validation

- Data Annotations for simple field validation (`[Required]`, `[MaxLength]`, `[Range]`, `[RegularExpression]`)
- Manual validation for business rules requiring context (cross-field rules, database lookups)
- Do not introduce FluentValidation without a discussion first
- ASP.NET Core model validation runs automatically — do not re-validate annotated fields manually
- Never trust client-supplied IDs for authorization — always verify ownership server-side
- Sanitize string inputs used in file paths or queries

### Cancellation Tokens

- Every async method must accept and pass a `CancellationToken`
- Applies to controllers, services, and all infrastructure calls (EF Core, HTTP clients, message queues, blob storage)
- Pass the token all the way down — do not swallow it at the service boundary

### Naming Conventions

- Controllers: `[Resource]Controller` (PascalCase)
- Services: `I[Name]Service` (interface) + `[Name]Service` (implementation)
- DTOs: `[Name]Request`, `[Name]Response`
- Action methods: HTTP verb conventions — `Get[Resource]`, `Create[Resource]`, `Update[Resource]`, `Delete[Resource]`
- Private fields: `_camelCase` with underscore prefix

### Project & Service Structure

- Controllers handle request/response only — authentication, validation, routing, returning results
- Simple synchronous operations belong as internal service classes within the API project
- Long-running, complex, or failure-prone work belongs in a Worker (via async message queue)
- Use a Worker when: operation can fail and needs retries, calls external services, is long-running, or has complex multi-step logic
- Service-to-service triggering: always use a queue, never direct HTTP calls
- Service-to-service reads: prefer shared database for read-only lookups
- Avoid synchronous call chains beyond a single hop

### Where Business Logic Lives

| Location | Use for |
|---|---|
| **API** | Validation, orchestration, routing, simple transformations |
| **Worker** | Long-running, failure-prone, external service calls, multi-step pipelines |
| **Stored Procedure** | Complex queries, aggregations, multi-table joins, performance-sensitive data operations |

- Do not duplicate logic across layers
- Business logic requiring database context (joins, aggregations, set-based operations) belongs in a stored procedure

### Data Access

- EF Core for single-table operations with no joins, no aggregations, no business logic
- Stored procedures for anything beyond that: multi-table joins, aggregations, filtering with business rules, reporting, performance-critical queries
- Call stored procedures via `AppDbContext.Database.ExecuteSqlRawAsync()` or `FromSqlRaw()`
- No repository abstraction — use EF Core and stored procedures directly
- Soft deletes by default — `IsDeleted` flag + `DeletedAt` timestamp
- Soft-deleted records excluded from all queries by default

### Dependency Injection

- Register services in `Program.cs` or a dedicated extension method
- Constructor injection only — never `HttpContext.RequestServices` (service locator anti-pattern)
- Appropriate lifetimes: Scoped for DB contexts, Singleton for stateless services, Transient for lightweight utilities

### Configuration

- Access via `IOptions<T>` pattern — not raw `IConfiguration` in services
- Never hardcode connection strings, API keys, or secrets
- Credentials stored as Azure Container Apps environment variables
- Use strongly-typed configuration classes

### Logging (Serilog)

- Serilog with `Serilog.Sinks.ApplicationInsights` and `Serilog.Sinks.Console` (local dev only)
- Use `APPLICATIONINSIGHTS_CONNECTION_STRING` — not legacy instrumentation key
- Required structured properties on every log entry: `UserId`, `OperationId`
- OperationId generated at API boundary (middleware), pushed via `LogContext`, carried on queue messages and internal HTTP calls via `X-Operation-Id` header
- Do not forward OperationId to external third-party services
- Correct log levels: Debug (internals), Information (normal ops), Warning (unexpected but handled), Error (failures), Critical (platform broken)
- Never log: user input (search queries, form inputs, chat messages, document content), AI response content, client matter identifiers, client/customer details in error messages

### Defensive Coding

- Validate at every boundary crossing — internal calls within the same boundary do not need defensive checks
- Boundaries: Frontend → API (HTTP request), API → Worker (queue message), API/Worker → External (response from DB, blob, AI, third-party API)
- Use C# nullable reference types — do not suppress warnings with `!` unless value is provably non-null
- Empty string and whitespace treated as null at all boundaries — use `string.IsNullOrWhiteSpace()`

### Code Quality

- Methods ≤40 lines, classes ≤300 lines
- Do not use exceptions for control flow — use result patterns or boolean returns
- Use `ConfigureAwait(false)` in library code
- No fire-and-forget async calls without error handling
- No LINQ with side effects (`.Select()` that mutates state)
- Do not build for hypothetical future requirements — flag concerns as comments and wait for a decision

### Testing

- Integration tests hit real dev environment resources — no in-memory database, no mocks
- Every endpoint: at least one integration test. Cover auth (valid/invalid/expired), pagination, validation failures, errors
- Workers tested by publishing real message → assert side effects
- Always test: duplicate message handling (idempotent outcomes), soft-delete exclusion
- Do not test: simple property mappings, framework behavior, code with no branching

### Engineering Decisions

- No patterns or abstractions (repository, mediator, CQRS) without discussion
- Performance/scaling/concurrency considered from the start — but specific approaches require discussion

---

## Advanced Code Review

- **N+1 queries** — DB queries inside loops → `.Include()`, projection, or batch queries. No lazy loading
- **Thread safety** — protect static mutable state; don't capture HttpContext in background threads; singletons must be thread-safe
- **Resources** — `IHttpClientFactory` not per-request HttpClient; `IDisposable` for unmanaged resources; stream large responses
- **Caching** — always set expiration; `SemaphoreSlim` for expensive cache population to prevent stampede
- **Middleware order** — exception handling → HTTPS → CORS → auth → authz → rate limiting → compression → custom → endpoints
- **Architecture** — thin controllers (no business logic); services depend on abstractions; cross-cutting via middleware/decorators/Polly

### Architecture Violations

- Controllers must be thin — no business logic, no direct database access, no complex conditionals
- Services must depend on abstractions (interfaces), not concrete implementations
- Cross-cutting concerns (logging, caching, retry) handled via middleware, decorators, or Polly policies — not scattered across service methods
- API must not perform long-running work inline — if it takes more than a few hundred milliseconds, it belongs in a Worker
