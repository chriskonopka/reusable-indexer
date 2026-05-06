---
name: api-setup-serilog
description: Scaffold the full Serilog configuration for an ASP.NET Core API or Worker service including Application Insights and required enrichers
---

# Setup Serilog

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `api-logging.md` — required enrichers, sink configuration, log levels, and what must never be logged

---

Scaffold the complete Serilog configuration including sinks, enrichers, and required structured properties.

## Steps

1. Check `*.csproj` for existing Serilog packages. Add any that are missing:
   - `Serilog.AspNetCore`
   - `Serilog.Sinks.ApplicationInsights`
   - `Serilog.Enrichers.Environment`
   - `Serilog.Enrichers.Thread`
2. Apply the correct `Program.cs` configuration based on project type (API or Worker — ask if unclear).
3. Confirm `APPLICATIONINSIGHTS_CONNECTION_STRING` is documented in the project's env var list or README. Do not hardcode it.

## API Template (Program.cs)

```csharp
builder.Host.UseSerilog((context, services, config) =>
{
    config
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithThreadId()
        .WriteTo.Console()
        .WriteTo.ApplicationInsights(
            services.GetRequiredService<TelemetryConfiguration>(),
            TelemetryConverter.Traces);
});

builder.Services.AddApplicationInsightsTelemetry();
```

## Worker Template (Program.cs)

```csharp
builder.Host.UseSerilog((context, services, config) =>
{
    config
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithThreadId()
        .WriteTo.Console()
        .WriteTo.ApplicationInsights(
            services.GetRequiredService<TelemetryConfiguration>(),
            TelemetryConverter.Traces);
});

builder.Services.AddApplicationInsightsTelemetryWorkerService();
```

## Rules

- `Enrich.FromLogContext()` is required — without it, `OperationId` and `UserId` pushed by middleware will not appear on log entries
- Do not configure minimum log levels in code — use `appsettings.json` so they can be changed per environment without a rebuild
- Sink configuration, `APPLICATIONINSIGHTS_CONNECTION_STRING` requirement, log-level definitions, OperationId propagation, and the never-log list are defined in `@.claude/rules/api-logging.md` — verify the generated `Program.cs` complies
