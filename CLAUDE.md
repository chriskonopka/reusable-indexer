# Engineering Standards

## MANDATORY — Before Planning or Writing Any Code

Before planning or implementing any feature, you MUST:

1. Identify every `.claude/rules/` file that governs the feature area using the table below
2. Read each of those files in full using the Read tool
3. State which rules you read and list the key constraints they impose
4. Read `.claude/rules/slicing.md` to confirm the planned slice scope is right-sized — once per feature, not once per slice

This applies to planning, design, and architecture — not just implementation. Rules contain implementation constraints that shape design decisions; you cannot plan correctly without knowing them. Read once per feature, not once per phase.

Do not write a single line of implementation code — or propose an implementation plan — before completing these steps.

**Do not invent constraints.** If a limit, threshold, timeout, or behaviour is not stated in a rule file, it does not exist. Do not add it. If you are unsure, ask.

| Feature area | Rule files to read before implementing |
|---|---|
| Document upload (API) | `document-pipeline/api-document-upload.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Document upload (Web) | `document-pipeline/web-document-upload.md` |
| Document upload (full feature) | `document-pipeline/api-document-upload.md`, `document-pipeline/web-document-upload.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Document processing / extraction | `document-pipeline/api-document-processing.md`, `document-pipeline/api-extraction.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Vector search / embeddings | `document-pipeline/api-vector-search.md` |
| Streaming / SSE | `api-streaming.md` |
| Worker / Service Bus | `api-worker.md` |
| LLM routing | `api-llm-auth.md` |
| Auth | `api-auth.md` |
| Secrets | `api-secrets.md` |
| PII handling | `api-pii-handling.md` |
| Logging | `api-logging.md`, `api-pii-handling.md` |
| Error handling | `api-error-handling.md`, `document-pipeline/api-pipeline-error-handling.md` |
| Citations | `document-pipeline/api-citations.md` |
| Conversation history | `document-pipeline/api-conversation-history.md` |
| Web components | `web-component-architecture.md`, `web-coding-standards.md`, `web-styling.md` |
| Web state | `web-state-management.md` |
| Web testing | `web-testing.md` |
| Database tables | `database-coding-standards.md`, `database-migrations.md` |
| Database stored procedures | `database-stored-procedures.md`, `database-coding-standards.md` |
| Database migrations | `database-migrations.md` |
| Database testing | `database-testing.md` |

---

## Sub-Agent Orchestration

Sub-agents are not the default — for slices that fit in a single context, prefer single-agent execution. When you do dispatch a sub-agent, the orchestrator owns the compliance contract. The sub-agent only sees what you pass it: its starting prompt is the rules it has.

**Orchestrator obligations when dispatching a sub-agent:**

1. **Pass the relevant rule excerpts in the prompt.** Sub-agents do not inherit `CLAUDE.md` or any `.claude/rules/` file. Identify the rules that govern the sub-agent's scope and quote the binding constraints into its prompt — do not assume it will go find them.
2. **State the applicable completion gates and skills.** Tell the sub-agent which `/code-review`, `/security-review`, `/commit`, or area-specific skills its work must run through, and which gates (`npm run lint`, `dotnet test`, tSQLt, etc.) must pass before it returns.
3. **Verify the output independently before accepting.** When the sub-agent reports back, read the files it changed, run the relevant gates yourself, and check the output against the rules you passed in. Do not accept the sub-agent's self-reported completion status as proof. If verification fails, re-task the sub-agent with the specific deficiencies.
4. **A task is not complete until every applicable gate passes** — at any level of the agent hierarchy. Partial completion is not completion.

---

## Execution Discipline

- **If the scope is too large, say so — do not cut silently.** State explicitly what you are skipping and why. A known gap the user can plan around is better than a silent omission.
- **Default to confirming before destructive, large-scope, or network-affecting actions.** Pause and ask before anything irreversible or shared-state (`rm -rf`, force-push, `reset --hard`, dropping schema, deploying, pushing, opening or merging PRs, posting to external services).

---

## Architectural Decision Authority

Orchestrators and sub-agents make routine architectural decisions on their own. Follow `.claude/rules/`, use judgment, and note non-obvious choices briefly so the user can redirect.

**Decide and proceed:** local, low-impact choices that follow existing conventions and stay contained to a small area of the codebase.

**Stop and ask:** decisions that introduce new patterns, dependencies, or abstractions; cross-cutting concerns; affect shared contracts or schemas; span multiple areas; touch security, capacity, or scaling; or would change the rules themselves.

Rule of thumb: if it's reversible quickly and locally, decide. If reversing it would ripple across the codebase, ask first — present 2–3 options with tradeoffs.

---

## Pre-Implementation Checklist

State which tiers this slice touches in one line before walking the checklist, e.g. *"Tiers: Always, Code, API endpoint, Database table."* This makes the scope visible and prevents silently skipping a tier that should apply.

| Tier | Trigger | Items |
|---|---|---|
| **Always** | every slice | Every limit/threshold/timeout/count comes from a rule file (none invented). Tests ship in this slice — never deferred. |
| **Code** | any executable code | User content, AI responses, document content, and PII are never logged (`HighlyConfidential` logs as `[RESTRICTED]`). `CancellationToken` is passed to every async method, including infrastructure calls. |
| **API endpoint** | adding/changing a controller route | Ownership violations return `403`, never `404`. All errors use ProblemDetails (RFC 7807) with plain-language `detail`. Stack traces, internal exceptions, and infra details are never exposed. |
| **API service** | adding a new service class | xUnit tests cover happy path, permanent failure (no retry), and cancellation. At least one integration test covers the full request/response cycle. |
| **Web component** | adding/changing a React component | Colocated `.test.tsx` exists with `jest-axe` assertions across each meaningfully different rendered state (loading, error, disabled, open/closed, etc.) — not just default render. 80% coverage from real-behavior tests, not snapshots or `istanbul ignore`. |
| **Web hook** | adding a hook that manages state transitions | Unit tests cover all dispatch actions and edge cases. |
| **Database table** | adding/altering a table | PK + six audit columns + soft-delete. Idempotent migration (`IF NOT EXISTS`) with a rollback script. Every FK has a non-clustered index. |
| **Stored procedure** | adding/altering a proc | tSQLt test class covers happy path, NULL/empty inputs, and error conditions. |
| **Worker / Service Bus handler** | touching message handlers | Worker checks `ProcessedAt` (idempotent). Transient failures abandon, permanent failures dead-letter. W3C trace context (`traceparent`/`tracestate`) restored before any logging. |
| **Document upload — API** | only when touching upload pipeline | Files stream directly to Blob (never loaded into API memory). Blob path: `{documentSetId}/{batchId}/{documentId}/original/{fileName}`. Service Bus messages carry `operation_id`/`traceparent`/`tracestate`. Complete signal counts actual SQL rows — never trusts client count. Error chain: blob fail → no SQL row, `502`; SQL fail → delete blob, `500`; SB fail → mark `Failed`, still `202`. |
| **Document upload — Web** | only when touching upload UI | Sliding window of 5 concurrent uploads (default — see `document-pipeline/web-document-upload.md`). As slots free, next file starts immediately. `/complete` called once after all files submitted, never per-file. Status polling and folder tree run in parallel. Per-file failures surface per-file; remaining uploads continue. |

Tiers omit anything outside the slice. If you're touching React, you don't walk the stored-procedure tier; if you're touching schema, you don't walk the React tier.

---

## Capacity and Scalability

Default peak: **500 concurrent users**, unless the project-level CLAUDE.md specifies otherwise. This applies to all scaling decisions — API replica limits, worker max-replicas, queue depth trigger ratios, and AI service tier selection. Do not set max-replicas without knowing what the downstream AI service can absorb — worker replicas that outpace AI rate limits cause retry storms that make throughput worse, not better.

This is the only place capacity is stated. Layer-specific files do not restate it.

---

## Monorepo Structure

| Area        | Location    | Stack                        |
| ----------- | ----------- | ---------------------------- |
| Frontend    | `web/`      | React, TypeScript, webpack 5 |
| Middle Tier | `api/`      | ASP.NET Core, EF Core, Azure |
| Database    | `database/` | Azure SQL, Stored Procedures |

Each area has its own `CLAUDE.md` with stack details, completion gates, and a rule-file index for that layer. Read the area file when you start working in that area.

- [`web/CLAUDE.md`](web/CLAUDE.md) — frontend stack, jest/jest-axe, completion gates
- [`api/CLAUDE.md`](api/CLAUDE.md) — .NET stack, API standards, document-upload feature pointer
- [`database/CLAUDE.md`](database/CLAUDE.md) — schema standards, naming, indexing, completion gates

---

## Quality Gates

All commits go through a review gate. Direct `git commit` is blocked by a PreToolUse hook.

| Command            | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `/commit`          | Stage, review, and commit. Runs `/code-review` and `/security-review` automatically. |
| `/ship`            | Full workflow: `/commit` + push + create PR. Stops at PR creation (no merge).        |
| `/code-review`     | Run a code review independently (without committing).                                |
| `/security-review` | Run a security review independently (without committing).                            |
| `/remediation`     | Fix issues found by reviews or external scanners (GitLeaks, SonarQube, Dependabot).  |

---

## Document Upload Reference Implementation

This template ships an opt-in document upload + RAG reference under `.claude/rules/document-pipeline/` and `.claude/skills/examples/document-upload/`. If your project does not need it, delete both folders and skip the related rule rows above — the rest of the template is independent of them.
