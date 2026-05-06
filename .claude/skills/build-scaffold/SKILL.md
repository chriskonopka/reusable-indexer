---
name: build-scaffold
description: Step 2 — scaffold project skeleton from /docs/architecture (config, dirs, DB, auth, /shared/, health-check). No feature logic. Stops at the scaffold review gate.
version: "0.1"
---

# /build-scaffold — Step 2: Scaffold

Stand up the empty skeleton the slice plan will fill. **No feature logic.** The only behaviour shipped is a health-check that proves the stack wires end-to-end.

## Read first

- All of `/docs/architecture/` and `/shared/types/`
- `CLAUDE.md` and per-area `CLAUDE.md`
- `.claude/profile.json` — constrains which subsystems to scaffold

## Steps

### 1. Guard

- If `/docs/architecture/` is missing or empty, **STOP** — tell the user to run `/build-architecture`.
- Verify all seven Step 1 artifacts exist: `data-model.md`, `api-contracts.md`, `module-boundaries.md`, `shared-types.md` (plus its `/shared/types/*.ts`), `dependency-graph.md`, `shared-inventory.md`, `slice-plan.md`. Any missing → **STOP**.

### 2. Load contracts

Read every file under `/docs/architecture/` and `/shared/types/`. State which slices from `slice-plan.md` the scaffold must support first (typically the first 3-5).

### 3. Scaffold the skeleton

For each module in `module-boundaries.md`, create the directory and entry-point file with no feature logic:

- **Configuration** — env loader, schema, secrets wiring. Validate at boot.
- **Directory structure** — folder tree matching `module-boundaries.md`. Every leaf gets a placeholder file with a one-line "what belongs here" comment.
- **Database connection** — pool/client wiring only. No queries. No migrations beyond what health-check needs.
- **Auth middleware** — stub the pipeline; do not implement policy.
- **Shared types** — re-export `/shared/types/` so every layer imports one canonical shape.
- **Health-check endpoint** — single endpoint hitting config + DB + auth pipeline. Green response = stack is wired.

### 4. Scaffold /shared/

For every entry in `shared-inventory.md`:

- Create `/shared/<concern>/`.
- Add `index.ts` (or equivalent) that **exports only** — no implementation.
- Add `README.md` with two sections:

  ```
  ## What belongs here
  <one-paragraph charter, traced to shared-inventory.md>

  ## What does not belong here
  <explicit out-of-scope list>
  ```

Goal: a slice author scans `/shared/` once and knows where to import from vs. where to extend.

### 5. Update the architecture doc

- `module-boundaries.md` — note any directory names that diverged, and why.
- `shared-inventory.md` — add "Status: scaffolded" + on-disk location per entry.
- New `scaffold-notes.md` — decisions, gaps, contract clarifications surfaced during scaffolding. Add a row for it in `/docs/architecture/README.md` so it's reachable from the index.

### 6. Prove it works

Boot the app, hit `/health`. Green response is the exit criterion — capture status + body in the report. If it fails, fix it before stopping. A scaffold that doesn't boot is not a scaffold.

### 7. Report and stop

Report: directories created (root + `/shared/`), health-check status, architecture-doc changes made, and explicit confirmation to the reviewer that **(a)** the structure supports the slice plan and **(b)** `/shared/` is sufficient for the first 3-5 slices to consume rather than reimplement. Then **STOP** for scaffold review.

## If scaffolding surfaces an architecture problem

Scaffold review does **not** re-litigate architecture. But if a real defect appears (boundary that can't stand, shared concern with no home, file-level dependency cycle): stop, surface it, update `/docs/architecture/`, re-run the Step 1 review, then resume.

Do not paper over architecture defects with scaffold workarounds.

## Do not

- Implement feature logic, business validation, domain rules, or any controller beyond health-check.
- Invent shared concerns absent from `shared-inventory.md`.
- Modify locked signatures from `/docs/architecture/` without updating the doc and flagging the change.
- Skip the health-check — it is the contract that proves the wiring.
