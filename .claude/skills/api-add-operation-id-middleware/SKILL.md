---
name: api-add-operation-id-middleware
description: Scaffold OperationId middleware and register it as the first item in the ASP.NET Core pipeline
---

# Add Operation ID Middleware

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `api-logging.md` — structured logging requirements, enrichers, and what must never be logged

---

Scaffold and register middleware that generates, propagates, and echoes an `OperationId` on every request. This must be the first item in the pipeline so every downstream log entry carries it.

## Steps

1. Create `Middleware/OperationIdMiddleware.cs` using the template below.
2. Register it in `Program.cs` as the **first** `app.Use*` call — before auth, routing, and controllers.
3. Confirm Serilog is configured with `LogContext` enrichment (`Enrich.FromLogContext()`) — this is required for the pushed property to appear on log entries. If it is missing, flag it to the user and recommend running `/api-setup-serilog`.

## Middleware Template

```csharp
using Serilog.Context;
using System.Diagnostics;

namespace {{Namespace}}.Middleware;

public class OperationIdMiddleware(RequestDelegate next)
{
    private const string HeaderName = "X-Operation-Id";

    public async Task InvokeAsync(HttpContext context)
    {
        var operationId = context.Request.Headers[HeaderName].FirstOrDefault()
                          ?? Activity.Current?.Id
                          ?? Guid.NewGuid().ToString();

        context.Response.Headers[HeaderName] = operationId;

        using (LogContext.PushProperty("OperationId", operationId))
        {
            await next(context);
        }
    }
}
```

## Registration in Program.cs

```csharp
app.UseMiddleware<OperationIdMiddleware>(); // must be first
```

## Rules

- Replace `{{Namespace}}` with the project's root namespace
- OperationId conventions (header name `X-Operation-Id`, `LogContext` push, must be the first pipeline item, Workers restore from message `ApplicationProperties` instead of using this middleware, no forwarding to third parties) are defined in `@.claude/rules/api-logging.md` — verify the generated middleware and `Program.cs` registration comply
- Full middleware ordering for the ASP.NET Core pipeline is in `@.claude/rules/api-performance.md`
