# Performance Standards — .NET / Azure

## Query Patterns

- **N+1 queries** — never run database queries inside a loop. Use `.Include()` for related data, projection (`Select(...)`) to shape exactly what you need, or batch queries
- No EF Core lazy loading — every related load is explicit
- For read-only queries, use `.AsNoTracking()`

## Long-Running Work

- API requests must not perform long-running work inline — if an operation takes more than a few hundred milliseconds, it does not belong in an HTTP request handler. Escalate to background processing.
- The background mechanism depends on the project shape: a Service Bus-triggered Worker (full monorepo with Service Bus + Worker Service), an `IHostedService` with a queue or timer, or a Hangfire job. Pick the one that matches the project's existing infrastructure — do not introduce a new dependency without discussion. Azure Functions are not the default in this stack — surface them as a question before proposing them, never as the chosen approach.
- This rule applies to: external HTTP calls, AI/LLM invocations, large file processing, multi-step orchestrations, anything with retry semantics.
- The HTTP-side response pattern is the same regardless of mechanism: accept the request, return `202 Accepted` with a way for the client to check status, hand the work off.

## Thread Safety

- Protect static mutable state with locks or use immutable types — never share mutable state across requests without explicit synchronisation
- Do not capture `HttpContext` (or anything resolved from it) in background threads — `HttpContext` is per-request and disposed when the request ends
- Singleton services must be thread-safe — they handle concurrent requests by definition

## Resource Management

- Use `IHttpClientFactory` — never `new HttpClient()` per request. Per-request `HttpClient` causes socket exhaustion under load
- Wrap unmanaged resources in `IDisposable` and consume them with `using` / `await using`
- Stream large responses (`Stream`, `IAsyncEnumerable<T>`) — never buffer multi-megabyte payloads into memory
- File and blob downloads use `Stream` end-to-end — do not call `.ReadToEndAsync()` or `.ToArrayAsync()` on large content

## Caching

- Always set an explicit expiration — no caches without a TTL
- Use `SemaphoreSlim` to serialise expensive cache population — prevents thundering-herd / cache stampede when many requests miss simultaneously
- Cache keys must be deterministic and include all inputs that affect the result — partial keys cause cross-tenant leaks

## Cross-Cutting Concerns

- Logging, caching, retry, and circuit-breaker logic live in middleware, decorators, or Polly policies — not scattered across service methods

## Outbound Throttling and Retry

Any external service call must have throttling/retry handling. The handling either comes from the SDK or is added explicitly. Calling a documented-throttled service without retry handling is forbidden.

In preference order:

1. **Use an SDK with built-in throttling handling.** These honor `Retry-After` and auto-retry on `429`/`5xx` with no extra code:
   - Official `Anthropic` NuGet package (set `MaxRetries = 3` to match the project default; SDK default is 2)
   - `Microsoft.Graph` SDK (`RetryHandler` is in the default middleware pipeline)
   - `PnP.Core` SDK for SharePoint Online operations not covered by Graph
   - Azure SDKs — `BlobServiceClient`, `ServiceBusClient`, `BlobClient`, etc. all ship with default retry policies

2. **If the SDK does not handle throttling**, register its `HttpClient` with `Microsoft.Extensions.Http.Resilience`'s standard handler:
   ```csharp
   services.AddHttpClient<IMyClient, MyClient>()
           .AddStandardResilienceHandler();
   ```
   This gives 3 retries with exponential backoff and jitter, 30-second total timeout, circuit breaker, and `Retry-After` honoring — equivalent to a hand-rolled Polly policy with no maintenance.

3. **Forbidden** — do not call a documented-throttled service via raw `HttpClient` or raw CSOM with no retry handling. Do not hand-roll retry loops that ignore `Retry-After`.

Permanent failures (`400`/`401`/`403`) are never retried — they fail fast and surface to the caller.

## Middleware Order

The ASP.NET Core pipeline order matters. Register middleware in this order in `Program.cs`:

1. Exception handling (`UseExceptionHandler`)
2. HTTPS redirection (`UseHttpsRedirection`)
3. CORS (`UseCors`)
4. OperationId middleware (must be before any logging — see `api-logging.md`)
5. Authentication (`UseAuthentication`)
6. Authorization (`UseAuthorization`)
7. Rate limiting (`UseRateLimiter`)
8. Response compression (`UseResponseCompression`)
9. Custom middleware (request logging, etc.)
10. Endpoints (`MapControllers`, `MapHealthChecks`)

Authentication must run before authorization. Exception handling must wrap the entire pipeline so it catches failures in any later step. OperationId middleware runs before authentication so that auth-failure log entries are still correlated.
