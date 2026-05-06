# Middle Tier Security Review Checklist — .NET / Azure

---

## OWASP Top 10 — .NET / Azure Scope

---

### A01: Broken Access Control

- **Missing `[Authorize]` attribute** — every endpoint must have `[Authorize]` unless explicitly intended to be public. Exception: `GET /health` is always anonymous.
- **Ownership not verified** — user-supplied IDs used to fetch resources without verifying the requesting user owns or has access to that resource.
- **Missing role-based checks** — sensitive endpoints (admin operations, bulk exports, case documents) without `[Authorize(Roles = "...")]` or policy-based authorization.
- **Client-side-only authorization** — role checks implemented only in the frontend without corresponding server-side enforcement.
- **Authorization model not documented** — if the project has no documented authorization decision in its CLAUDE.md, flag for discussion before implementing role-based access.

---

### A02: Cryptographic Failures

- **Secrets in `appsettings.json`** — production secrets (connection strings, API keys, signing keys) must not appear in config files. They belong in Azure Container Apps environment variables (Key Vault at go-live).
- **Sensitive data in logs or error messages** — SSNs, case details, client matter identifiers, AI response content, user input must not appear in Serilog or App Insights logs.
- **Passwords stored or transmitted in plain text** — must use hashing (bcrypt or ASP.NET Core Identity).
- **Credentials in connection strings** — services authenticating to Azure resources (SQL, Blob Storage, Service Bus) must use Managed Identity via `DefaultAzureCredential` — no passwords in connection strings, no API keys in config.
- **Legacy instrumentation key** — must use `APPLICATIONINSIGHTS_CONNECTION_STRING`, not the legacy key.

---

### A03: Injection

- **Raw SQL string concatenation** — all queries must use Entity Framework parameterized queries or stored procedures with parameters. Never concatenate user input into SQL strings.
- **Unvalidated `[FromBody]`/`[FromQuery]`/`[FromRoute]` input** — all incoming data must be validated via Data Annotations or manual validation before use.
- **Log injection** — user input written to logs must use structured logging parameters, not string concatenation:
  ```csharp
  // Bad — injectable
  _logger.LogInformation("User: " + userInput);
  // Good — structured
  _logger.LogInformation("User: {User}", userInput);
  ```
- **Path traversal** — user-supplied file names must be sanitized with `Path.GetFileName()`. Reject inputs containing `..`, `/`, or `\`.
- **XML External Entity (XXE)** — if XML parsing is used, `DtdProcessing` must be set to `Prohibit` and `XmlResolver` to `null`.

---

### A04: Insecure Design

- **Sensitive operations via GET** — mutations (create, update, delete) must use POST/PUT/PATCH/DELETE, never GET. Sensitive operations (bulk export, account deletion) require confirmation.
- **Client-only file upload validation** — file type and size must be validated server-side in the controller. Critical for document-handling applications.
- **Unbounded list endpoints** — any endpoint returning a collection must enforce pagination with a maximum page size (100). No endpoint returns an unbounded list.
- **Missing cancellation tokens** — async methods without `CancellationToken` parameters cannot be cancelled by the client or platform, leading to resource exhaustion.

---

### A05: Security Misconfiguration

- **`AllowAnyOrigin()` in CORS** — production CORS must restrict to specific allowed origins from environment config, never hardcoded.
- **Stack traces in production** — detailed error messages and stack traces must be disabled in production. Use ProblemDetails with generic messages; log details server-side.
- **Unnecessary HTTP methods** — endpoints should only allow required methods (e.g., DELETE not enabled on read-only endpoints).
- **Missing security headers** — at minimum: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **Swagger/OpenAPI in production** — API documentation endpoints must be disabled in production (wrap in `app.Environment.IsDevelopment()` check).
- **`AllowAnyHeader()` + `AllowAnyMethod()` together** — restrict to specific headers and methods the frontend actually needs.
- **No request body size limits** — unbounded request bodies enable denial-of-service via memory exhaustion. Add `[RequestSizeLimit(n)]` on upload endpoints or configure globally in Kestrel.
- **Debug mode in production** — verbose error pages, developer exception pages, or debug logging enabled in production builds.

---

### A06: Vulnerable and Outdated Components (NuGet)

- **`dotnet list package --vulnerable`** — run and check for known CVEs. Critical/High must be fixed before commit. Moderate must be flagged.
- **New NuGet package verification** — for every new package in the diff, verify:
  - Exists on official NuGet gallery (nuget.org)
  - Recent maintenance activity (no updates in 2+ years is a risk)
  - Download count not suspiciously low (typosquatting indicator)
  - No Cyrillic or non-ASCII characters in package name
  - Publisher is established (recently created publisher on widely used packages is a red flag)
  - Package is signed
  - No dependency confusion risk (internal Azure Artifacts package name not resolvable from nuget.org)
- **NuGet.Config modification** — changes could redirect package resolution to a malicious source. Require explanation and approval.
- **Local file path references (`<HintPath>`)** — bypass NuGet vulnerability scanning. Require justification.

---

### A07: Authentication

- **Azure App Registration / Entra ID** — `Microsoft.Identity.Web` handles token validation. No custom JWT, no manual token parsing.
- **Missing or misconfigured JWT validation** — must verify issuer, audience, lifetime, and signing key.
- **Hardcoded test credentials or bypass flags** — must be removed immediately.
- **Expired tokens accepted** — token lifetime validation must be enforced in JWT bearer config.
- **No rate limiting on login endpoints** — enables brute force attacks. Add rate limiting middleware (e.g., 5 requests per minute).

---

### A08: Software and Data Integrity

- **CI/CD pipeline modification** — changes that skip security steps must be flagged as Critical and escalated.
- **`BinaryFormatter` usage** — vulnerable to remote code execution. Must use `System.Text.Json` instead.
- **`TypeNameHandling.All` or `TypeNameHandling.Auto`** in Newtonsoft.Json — enables deserialization attacks. Must use `TypeNameHandling.None` (default) or a custom `SerializationBinder`.
- **Model binding directly to entity models** — must use dedicated request DTOs with only settable properties. Never bind directly to EF entities.
- **Missing `[ApiController]` attribute** — without it, model state validation is not automatic.

---

### A09: Security Logging and Monitoring

- **Authentication events not logged** — login, logout, and failed attempts must produce structured log entries.
- **Sensitive operations without audit trail** — document access, case updates, and privileged actions must be logged.
- **Sensitive data in logs** — tokens, passwords, PII, user input, AI responses, client matter identifiers must never appear in application logs.
- **Logs written to insecure destinations** — logs must go to Application Insights or encrypted storage, not publicly accessible directories.
- **Missing OperationId middleware** — every API must include operation ID middleware as the first pipeline item. Reads `X-Operation-Id` from request, generates if absent, pushes to Serilog LogContext, echoes on response header.

---

### A10: Server-Side Request Forgery (SSRF)

- **User-supplied URLs in server-side HTTP calls** — URLs from user input passed to `HttpClient` without validation against an allowlist.
- **Internal Azure service URLs constructable from user input** — internal service URLs must be hardcoded in configuration, not derived from user input.
- **Server-side redirects with user-supplied URLs** — redirect targets must be validated against an allowlist.

---

## Advanced

- **Rate limiting beyond auth** — file upload endpoints without per-user limits (storage exhaustion), expensive operations (search, export) without limits or queuing (DoS), API keys/tokens without expiration
- **`Cache-Control: no-store`** — responses containing PII or case data must include `[ResponseCache(NoStore = true)]`
- **Secrets exposure** — secrets as CLI arguments (visible in `ps`), secrets in query strings (server logs, browser history), shared secrets across environments (dev compromise → prod), hardcoded encryption keys (must use Key Vault)

## Container Security

- Base images pinned to specific version from `mcr.microsoft.com` — never `latest`, never untrusted sources
- No secrets as Docker build ARG/ENV — inject at runtime via container app env vars
- Multi-stage builds, `.dockerignore` excluding `appsettings.*.json`/`.env`, pinned `apt-get` versions
- Same image promoted dev → staging → prod — only env vars differ
