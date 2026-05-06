---
name: api-add-health-endpoint
description: Scaffold an anonymous GET /health endpoint in an ASP.NET Core API project
---

# Add Health Endpoint

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `api-error-handling.md` — ProblemDetails format and error response conventions

---

Scaffold a `GET /health` endpoint that is always anonymous — required for Azure Container Apps health checks.

## Steps

1. Check whether a `HealthController.cs` already exists in the `Controllers` folder. If it does, stop and tell the user.
2. Create `Controllers/HealthController.cs` using the template below.
3. Confirm `Program.cs` has `app.MapControllers()` — if not, add it.
4. Tell the user the endpoint is available at `GET /health` and requires no token.

## Template

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace {{Namespace}}.Controllers;

[ApiController]
public class HealthController : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("health")]
    public IActionResult Get()
        => Ok(new { status = "healthy", timestamp = DateTimeOffset.UtcNow });
}
```

## Rules

- Replace `{{Namespace}}` with the project's root namespace
- Anonymous-access policy and the no-dependencies / no-DB-calls rule for `/health` are defined in `@.claude/rules/api-auth.md` and the API Standards section of `api/CLAUDE.md` — verify the generated controller complies
