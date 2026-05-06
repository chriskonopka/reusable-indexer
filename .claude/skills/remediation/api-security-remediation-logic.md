# Middle Tier Security Remediation Logic — .NET / Azure

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **Missing `[Authorize]`** — add to controller. Exception: `GET /health` stays `[AllowAnonymous]`
- **Secrets in appsettings.json** — remove, move to Azure Container Apps env var or Managed Identity
- **Sensitive data in logs** — remove PII, client matter IDs, user input, AI responses
- **Log injection** — change string concatenation to structured logging: `"User: {User}", input`
- **Path traversal** — add `Path.GetFileName()`, reject `..`, `/`, `\`
- **Swagger in production** — wrap in `if (app.Environment.IsDevelopment())`
- **BinaryFormatter** — replace with `System.Text.Json` (RCE risk)
- **TypeNameHandling.All/Auto** — change to `TypeNameHandling.None`
- **Model binding to entity** — create dedicated request DTO
- **Missing `[ApiController]`** — add to controller (enables automatic model validation)
- **Dockerfile `latest` tag** — pin to specific version (e.g., `mcr.microsoft.com/dotnet/aspnet:8.0.1`)
- **Secrets as Docker build ARG** — remove, inject via container app env vars at runtime

### Non-Obvious Fixes (with pattern)

**Raw SQL concatenation → parameterized:**
```csharp
await _context.Database.ExecuteSqlRawAsync(
    "SELECT * FROM Users WHERE Name = @p0", userName);
```

**XXE prevention:**
```csharp
var settings = new XmlReaderSettings {
    DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null
};
using var reader = XmlReader.Create(stream, settings);
```

**CORS restriction:**
```csharp
p.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()!)
 .WithMethods("GET", "POST", "PUT", "DELETE")
 .WithHeaders("Content-Type", "Authorization");
```

**Security headers middleware:**
```csharp
app.Use(async (context, next) => {
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Append("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    await next();
});
```

**Rate limiting on auth endpoints:**
```csharp
builder.Services.AddRateLimiter(options => {
    options.AddFixedWindowLimiter("auth", opt => { opt.PermitLimit = 5; opt.Window = TimeSpan.FromMinutes(1); });
});
// Controller: [EnableRateLimiting("auth")]
```

**OperationId middleware (first in pipeline):**
```csharp
app.Use(async (context, next) => {
    var operationId = context.Request.Headers["X-Operation-Id"].FirstOrDefault()
        ?? Activity.Current?.Id ?? Guid.NewGuid().ToString();
    using (LogContext.PushProperty("OperationId", operationId)) {
        context.Response.Headers.Append("X-Operation-Id", operationId);
        await next();
    }
});
```

**Missing .dockerignore:**
```
appsettings.*.json
.env
*.user
*.suo
bin/
obj/
```

## Manual Issues (Report + Suggest Approach)

- **Ownership verification** — add ownership filter to queries. May require policy-based auth handler. Flag if auth model not documented
- **Managed Identity migration** — replace password-based connection strings with `DefaultAzureCredential`. Requires Azure infra changes
- **Request body size limits** — add `[RequestSizeLimit(n)]` on uploads or configure globally in Kestrel
- **Vulnerable NuGet packages** — upgrade, use `<PackageVersion>` for transitive deps, document accepted risk if no fix
- **Token refresh/lifetime** — configure `Microsoft.Identity.Web` with `ValidateLifetime = true`. Requires frontend coordination
- **SSRF prevention** — URL allowlist, hardcode internal service URLs, reject internal network ranges
- **Multi-stage Dockerfile** — restructure: SDK build stage → aspnet runtime stage
