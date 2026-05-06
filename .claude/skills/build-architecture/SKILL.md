---
name: build-architecture
description: Step 1 — produce architecture artifacts under /docs/architecture and /shared/types from a requirements doc. No code. Stops at the architecture review gate.
version: "0.1"
---

# /build-architecture — Step 1: Architecture First

Lock the contracts every later step builds against. **No implementation code.**

`$ARGUMENTS` must be a requirements doc (path, attachment, or pasted). It is the authoritative source — every artifact must trace back to it.

## Read first

- `.claude/rules/slicing.md` — slice grain
- `CLAUDE.md` and per-area `CLAUDE.md` — engineering standards to respect
- `.claude/profile.json` — active profile decides which subsystems are in scope

## Steps

### 1. Confirm inputs

- If `$ARGUMENTS` is empty, ask for the doc and **STOP**.
- Read it in full before writing any artifact.
- If `/docs/architecture/` already has files: list them, ask whether to extend, replace, or abort. Never silently overwrite.

### 2. Produce the seven artifacts

Markdown under `/docs/architecture/`, types under `/shared/types/`. Nothing else gets written this step.

| # | Artifact | File |
|---|---|---|
| 1 | Data model — entities, relationships, constraints | `data-model.md` |
| 2 | API contracts — endpoints, request/response, errors | `api-contracts.md` |
| 3 | Module boundaries — what each module owns and exposes | `module-boundaries.md` |
| 4 | Shared types — vocabulary all layers speak | `/shared/types/*.ts` + `shared-types.md` index |
| 5 | Dependency graph — module → module, must be acyclic | `dependency-graph.md` |
| 6 | Shared components inventory (see below) | `shared-inventory.md` |
| 7 | Slice plan (see below) | `slice-plan.md` |

### 3. Shared inventory (artifact 6)

List every cross-cutting utility (errors, validation, logging, formatters), shared UI primitive (forms, modals, tables, layouts), and infra helper (HTTP client, retry, auth guards, middleware). Per entry:

```
### <name>
- Interface: <signature or short prose>
- Location: /shared/<subdir>/<name>
- Consumers: <slices that will use it>
```

### 4. Slice plan (artifact 7)

Read `slicing.md` first. The plan must declare:

- **Target slice count** — typically 1-3× the spec's user-capability count. Justify if outside.
- **Reviewable LoC ceiling** — typically 5,000-8,000. Lower for security/regulated, higher for greenfield CRUD.
- **Per-slice entry**:

  ```
  ### Slice <n>: <name>
  - Spec section: <…>
  - User capability: "user can do X"
  - Scope: endpoints <…>, UI <…>, audit events <…>
  - Estimated LoC: <≤ ceiling>
  ```

- **Drift cap** — written verbatim: "slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review."

This plan is the locked contract for Step 3 review cadence.

### 5. Cross-check before stopping

- Every spec requirement maps to at least one slice or decision.
- Dependency graph has no cycles (walk it).
- Every spec requirement maps to ≥1 slice or decision.
- Slice count, ceiling, and drift cap are all on the page.

Fix any failure — do not paper over.

### 6. Report and stop

Report: files written (with paths), slice count + ceiling, and any assumptions you made (call them out explicitly). Then **STOP** for architecture review by a human. Do not start scaffolding.

## Do not

- Write implementation code (controllers, components, migrations).
- Modify locked signatures from a prior run without updating the doc and flagging the change.
- Invent contracts that don't trace to the requirements doc.
- Skip the slice plan or shared inventory — both are required.
- Pick a side when the requirements doc contradicts itself — surface the conflict and ask.
- Produce contracts for subsystems excluded by `.claude/profile.json`.
