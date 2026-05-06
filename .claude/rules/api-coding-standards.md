# Coding Standards — .NET / Azure

## Naming Conventions

- Controllers: `[Resource]Controller` — PascalCase, plural resource (e.g. `DocumentsController`)
- Services: `I[Name]Service` (interface) + `[Name]Service` (implementation)
- DTOs: `[Name]Request`, `[Name]Response` — never `[Name]Model` or `[Name]DTO`
- Action methods: HTTP-verb conventions — `Get[Resource]`, `Create[Resource]`, `Update[Resource]`, `Delete[Resource]`
- Async methods end in `Async` (`GetDocumentAsync`, not `GetDocument`)
- Private fields: `_camelCase` with underscore prefix
- Constants: `PascalCase` for `public const`; `UPPER_SNAKE_CASE` for environment-variable keys
- Boolean variables and properties: prefix with `Is`, `Has`, `Should`, or `Can`
- Variables must be descriptive and self-documenting — single-letter names are not allowed (including loop counters such as `i`, `j`, `k`; use `index`, `rowIndex`, etc.)

## Project Structure

- Controllers handle request/response only — authentication, validation, routing, returning results. **No business logic, no direct database access, no complex conditionals.**
- Simple synchronous operations belong in internal service classes within the API project — invoked from controllers via DI
- Services depend on abstractions (interfaces), not concrete implementations
- Service-to-service reads: prefer a shared database for read-only lookups over an HTTP call
- Avoid synchronous call chains beyond a single hop — chained HTTP/RPC across services creates latency and failure surface

## Async / Await Discipline

- Every async method must accept and pass a `CancellationToken`
- Applies to controllers, services, and all infrastructure I/O (EF Core, `HttpClient`, and any queue / blob / external service the project uses)
- Pass the token all the way down — never swallow it at a service boundary
- Use `ConfigureAwait(false)` in library code (anything not in the ASP.NET pipeline)
- No fire-and-forget async calls without explicit error handling — `_ = SomethingAsync()` is a bug
- Do not block on async code (`.Result`, `.Wait()`, `GetAwaiter().GetResult()`) — propagate `await` instead

## Control Flow

- Do not use exceptions for expected control flow — use result patterns, boolean returns, or nullable returns instead
- Throw exceptions only for genuinely exceptional conditions — invalid program state, unmet preconditions
- No LINQ with side effects (`.Select()` that mutates state, `.Where()` that calls services) — LINQ expressions must be pure

## Dependency Injection

- Register services in `Program.cs` or a dedicated extension method (e.g. `AddDocumentServices()`)
- Constructor injection only — never `HttpContext.RequestServices` or static service-locator patterns
- Lifetimes:
  - `Scoped` — anything that holds per-request state, including `DbContext`
  - `Singleton` — stateless utilities, configured clients (`IHttpClientFactory`, Azure SDK clients)
  - `Transient` — lightweight stateless helpers
- Never inject `Scoped` services into `Singleton` services — capture by factory or use `IServiceScopeFactory`

## Configuration

- Access configuration via the `IOptions<T>` pattern — bind a strongly-typed class in `Program.cs`, inject `IOptions<T>` into consumers
- Do not inject raw `IConfiguration` into services — that pattern is reserved for `Program.cs` startup code
- Use strongly-typed configuration classes — never read settings by string key inside services
- Environment variable keys are `UPPER_SNAKE_CASE` and namespaced (e.g. `DOCUMENTS_BLOB_CONTAINER`, not `Container`)
- For secrets handling (Key Vault as the only sanctioned store, what counts as a secret vs. non-secret config, forbidden patterns) see `api-secrets.md`

## Response Caching with Azure Front Door

The API sits behind Azure Front Door, which caches responses at the edge by default. Every API response must set explicit `Cache-Control` headers so AFD doesn't serve one user's data to another.

- **Default for any authenticated endpoint:** `Cache-Control: private, no-store`. Set this in middleware so it applies to every response unless explicitly overridden.
- **Public, shared resources** (lookup tables, status enums, non-user-scoped reference data): `Cache-Control: public, max-age=<seconds>` with an appropriate TTL.
- **Never rely on AFD's defaults.** An endpoint returning user-scoped data without an explicit `Cache-Control` header is a data-leak waiting to happen — the next request for the same URL from the same edge POP can receive the cached response.
