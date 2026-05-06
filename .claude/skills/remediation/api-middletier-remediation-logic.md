# Middle Tier Code Quality Remediation Logic — .NET / Azure

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **Naming violations** — controller: `[Resource]Controller`, service: `I[Name]Service`/`[Name]Service`, private field: `_camelCase`
- **Missing ActionResult** — change to `ActionResult<T>`, wrap in `Ok()`, `NotFound()`, `BadRequest()`, `CreatedAtAction()`
- **Service locator** — replace `HttpContext.RequestServices.GetService<T>()` with constructor injection
- **.Result/.Wait()** — replace with `await`
- **async void** — change to `async Task`
- **Multiple IEnumerable enumeration** — materialize with `.ToList()` before reuse
- **Deep nesting** — flatten with guard clauses and early returns
- **Broad exception catch** — catch specific types, or log and rethrow
- **Log injection** — change string concatenation to structured logging parameters

### Non-Obvious Fixes (with pattern)

**Business logic in controller → service extraction:**
```csharp
// Controller becomes thin:
public async Task<ActionResult<T>> Action(Request request, CancellationToken ct)
{
    var result = await _service.ProcessAsync(request, ct);
    return Ok(result);
}
```
Create `I[Name]Service` + `[Name]Service`, register in DI with appropriate lifetime.

**Missing CancellationToken — pass through entire chain:**
```csharp
public async Task<Entity> GetAsync(Guid id, CancellationToken cancellationToken)
    => await _db.Entities.FindAsync([id], cancellationToken);
```

**Missing ProblemDetails error response:**
```csharp
_logger.LogError(ex, "Failed to process request");
return Problem(detail: "An unexpected error occurred.", statusCode: 500);
```

**Raw IConfiguration → IOptions<T>:**
```csharp
public class ExternalApiOptions { public string Url { get; set; } = string.Empty; }
// Program.cs: builder.Services.Configure<ExternalApiOptions>(config.GetSection("ExternalApi"));
// Service: public MyService(IOptions<ExternalApiOptions> options) { ... }
```

**Soft delete with global query filter:**
```csharp
entity.IsDeleted = true;
entity.DeletedAt = DateTimeOffset.UtcNow;
// DbContext: modelBuilder.Entity<T>().HasQueryFilter(e => !e.IsDeleted);
```

**Pagination response:**
```csharp
return Ok(new { Items = items, TotalCount = count, Page = request.Page, PageSize = request.PageSize });
```

## Manual Issues (Report + Suggest Approach)

- **N+1 query** — suggest `.Include()`, projection with `.Select()`, or batch query
- **HttpClient per request** — suggest `IHttpClientFactory` with typed client pattern
- **Cache without expiration** — suggest absolute/sliding expiration; `SemaphoreSlim` for stampede prevention
- **Middleware ordering** — correct: exception handling → HTTPS → CORS → auth → authz → rate limiting → compression → custom → endpoints
- **Architecture** — API doing Worker work → move to queue; duplicated logic across layers → single source; HTTP triggering → queue
- **Thread safety** — static mutable → ConcurrentDictionary/lock; HttpContext in background → extract values first; singleton mutable state → Scoped
