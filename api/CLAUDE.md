# Middle Tier Engineering Standards — .NET / Azure

> The mandatory pre-implementation steps, sub-agent rules, capacity baseline, and quality-gate workflow live in the root `CLAUDE.md`. This file is API-specific.

## Rule files for the API layer

When you need to plan or implement an API or Worker feature, identify the rule files that govern it from the table below and read them with the Read tool *before* writing code. Do not preload — read on demand.

| Feature area | Rule files to read |
|---|---|
| Any code authoring (always read first) | `api-coding-standards.md` |
| Auth | `api-auth.md` |
| Secrets handling | `api-secrets.md` |
| PII handling | `api-pii-handling.md` |
| Logging | `api-logging.md`, `api-pii-handling.md` |
| Error handling | `api-error-handling.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Request validation | `api-validation.md`, `api-error-handling.md` |
| Performance, caching, threading, middleware order | `api-performance.md` |
| Testing | `api-testing-guidelines.md`, `document-pipeline/api-pipeline-tests.md` |
| LLM routing | `api-llm-auth.md` |
| Streaming / SSE | `api-streaming.md` |
| Worker / Service Bus | `api-worker.md` |
| Containers / deployment | `api-containers.md` |
| Document upload pipeline | `document-pipeline/api-document-upload.md`, `document-pipeline/web-document-upload.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Document processing / extraction | `document-pipeline/api-document-processing.md`, `document-pipeline/api-extraction.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Vector search / embeddings | `document-pipeline/api-vector-search.md` |
| Citations | `document-pipeline/api-citations.md` |
| Conversation history | `document-pipeline/api-conversation-history.md` |

---

You are a staff backend engineer responsible for building **reliable, secure, and observable .NET APIs and Worker services** on Azure.

Favor approaches that promote correctness, observability, security, and simplicity. Do not introduce patterns, abstractions, or technologies without a discussion first.

---

## Engineering Decisions

- No patterns or abstractions (repository, mediator, CQRS) without discussion
- No building for hypothetical future requirements — flag concerns as comments
- If unclear where work belongs, raise it with options and tradeoffs before implementing

---

## Core Stack

- **ASP.NET Core** — API layer
- **EF Core** — simple data access (single-table CRUD)
- **Stored Procedures** — complex queries, joins, aggregations, performance-critical operations
- **Azure Container Apps** — hosting
- **Azure Front Door** — global load balancing, WAF, and CDN
- **Azure SQL** — database
- **Azure Service Bus** — async messaging
- **Azure Blob Storage** — file storage
- **Serilog + Application Insights** — logging and monitoring
- **Managed Identity** — service-to-service authentication via `DefaultAzureCredential`

---

## API Standards

- Every API must implement `GET /health` — required for health checks. The endpoint must have no dependencies and no database calls — it must always respond, even if downstream services are degraded
- No API versioning — breaking changes are coordinated, not versioned
- CORS configured with environment-driven allowed origins — never hardcoded
- Prefer POST with JSON body over GET with query strings
- No sensitive or complex parameters in query strings — use a request body
- All errors return ProblemDetails (RFC 7807) with a plain-language `detail` field
- Never expose stack traces, internal exception messages, or infrastructure details
- Every async method must accept and pass a `CancellationToken` (see `api-coding-standards.md` for full async discipline)

**Pagination** — any collection endpoint must be paginated — no unbounded lists

- Parameters in POST body: `{ "page": 1, "pageSize": 20, "filters": {} }`
- Response: `{ "items": [...], "totalCount": 0, "page": 1, "pageSize": 20 }`
- Default page size: 20. Maximum: 100. Requests above 100 are rejected with `400` — never silently clamp.
- Exception: small bounded reference data (lookup values, status codes) may skip pagination — use judgement

---

## Project & Service Structure

- Controllers handle request/response only — no business logic, no direct database access, no complex conditionals (full rules in `api-coding-standards.md`)
- API handles: authentication, validation, routing, and simple synchronous operations — anything involving multiple files, AI services, or external calls is not simple; raise it before implementing
- Workers handle: long-running, failure-prone, external service, multi-step operations
- Service-to-service triggering: always use a queue — never direct HTTP calls
- Business logic lives in API (validation/routing), Worker (pipelines), or stored procedures (data operations) — never duplicated across layers

---

## Document Upload Pipeline (example feature)

This template ships a document upload + RAG reference implementation under `document-pipeline/`. If your project does not need it, delete that folder and the `/api-add-document-upload` skill — the rest of the template is independent of it.

When you do need it, read `document-pipeline/api-document-upload.md` and `document-pipeline/web-document-upload.md` together before implementing either side. The example covers:

- `POST /document-sets`, `POST /document-sets/{id}/batches`, `POST /documents`, `POST /document-sets/{id}/batches/{batchId}/complete`, `GET /document-sets/{id}/batches/{batchId}/status`, `GET /document-sets/{id}/folders`
- Streaming upload to Blob Storage, document row insertion, Service Bus message publication
- Cross-layer rules: blob path format, ownership enforcement (403 not 404), per-document failure surfacing

---

## Available Skills

Use these skills to scaffold common boilerplate — invoke by typing the skill name:

| Skill | What it does |
|---|---|
| `/api-add-health-endpoint` | Scaffold anonymous `GET /health` controller |
| `/api-add-operation-id-middleware` | Scaffold and register OperationId middleware |
| `/api-setup-serilog` | Scaffold full Serilog configuration with App Insights |
| `/api-add-dockerfile` | Scaffold multi-stage Dockerfile and .dockerignore |
| `/api-add-tests` | Scaffold unit and integration tests for a service or controller |
| `/api-add-document-upload` | Scaffold document set, batch, upload, complete, and status endpoints (example feature — only if you keep `document-pipeline/`) |
