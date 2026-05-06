---
name: build-application
description: Step 3 — implement the locked slice plan one slice at a time, in order, pausing for human confirmation between each slice. Auto-picks the first unstarted slice. Enforces grain rules in slicing.md and hard-stops at the rare review gates.
version: "0.1"
---

# /build-application — Step 3: Vertical Slice Implementation

Implement the locked slice plan **one slice per iteration, in order**. After each slice, run the review gates and pause for human confirmation before continuing. STOP on any non-yes answer; **hard-STOP** at the rare review gates (architecture every 5 slices, product review at spec-section completion).

A slice = **one user-visible capability** (something a user can describe in one sentence) — not a layer, not a single endpoint, not a single audit event.

`$ARGUMENTS` is optional:

- **Empty (common case)** → auto-pick the first slice in `slice-plan.md` without `Status: completed`.
- **Slice name** → start from that slice (must match an entry in `slice-plan.md`). Warn if there are earlier unstarted slices.

## Read first (once per session)

- `.claude/rules/slicing.md`
- All of `/docs/architecture/`
- All of `/shared/`
- `CLAUDE.md` and per-area `CLAUDE.md`
- `.claude/profile.json` — sanity-check no slice depends on a subsystem the active profile excludes

## Session hygiene (once per session, in order)

1. Read `/docs/architecture/`.
2. Read `/shared/` — know what exists before writing anything.
3. Load `slice-plan.md` and identify the starting slice.
4. Paste the contract sections (not just filenames) the first slice will build against.
5. Only then generate code.

If steps 1-4 are skipped, restart the session.

## Steps

### 1. Guards (once per session)

- Missing `slice-plan.md` → **STOP**, run `/build-architecture`.
- Missing or empty `/shared/` → **STOP**, run `/build-scaffold`.
- Every slice in `slice-plan.md` already marked `Status: completed` → final report and **STOP**.
- `$ARGUMENTS` provided but doesn't match a slice → **STOP**, list available slice names.
- `$ARGUMENTS` provided that skips earlier unstarted slices → warn explicitly, ask the user to confirm intent before proceeding.

### 2. Pick the starting slice

- `$ARGUMENTS` empty → first slice in `slice-plan.md` without `Status: completed`.
- `$ARGUMENTS` set → that slice.

State the slice name + capability sentence aloud before doing anything else.

---

The remaining steps **3–10 run per slice in a loop**. Step 11 decides whether to continue.

### 3. Confirm scope against the locked plan

Paste back from `slice-plan.md` for this slice: user-capability sentence, scope (endpoints, UI, audit events), LoC ceiling. If your understanding diverges → **STOP**, update the architecture doc, re-run architecture review, then resume.

### 4. Plan the cut across layers

Sketch in chat (not code):

| Layer                | This slice changes                                            |
| -------------------- | ------------------------------------------------------------- |
| Data / migrations    | tables, columns, indexes — or "none"                          |
| Shared types         | new types in `/shared/types/` — or "none, reusing X"          |
| `/shared/` utilities | what exists vs. what to extract here                          |
| API                  | endpoints + handlers + validation + audit events              |
| Frontend             | pages, components, hooks, state, styles                       |
| Tests                | unit, integration, E2E that prove the capability              |

Get user confirmation before coding.

### 5. Implement

- Walk the Pre-Implementation Checklist tiers that apply (per CLAUDE.md). State the tier list ("Tiers: Always, Code, API endpoint, Database table") before coding.
- Build against locked contracts. Don't invent new ones mid-slice — if a contract is wrong, stop, propose the change, update the doc, then resume.
- Complete the slice fully before continuing.
- Slice must be testable in isolation (not necessarily small).

### 6. /shared/ discipline

- Check `/shared/` before writing any helper. If it exists, import it.
- Future slice will clearly need it? Extract to `/shared/` now.
- Never duplicate logic already in `/shared/`.
- Update `shared-inventory.md` for every addition.

### 7. Living architecture docs

`/docs/architecture/` is the source of truth. If a request would change a contract, update the doc first, flag it, wait for approval. Keep module inventory, data flows, contracts, decisions, and `/shared/` inventory current.

### 8. Drift cap

Slice plan declared a 25% drift cap. Tempted to atomize "to make review easier" → **stop**; the grain in `slicing.md` is the contract. Slice genuinely needs more scope → stop, update `slice-plan.md`, re-run architecture review.

Never silently expand or split.

### 9. Per-slice review gate

Before declaring the slice done: run `/code-review` and `/security-review`, address findings per each skill's severity rules.

### 10. Mark slice complete and document

Slice is not done until all three exist:

1. Append `- Status: completed` to the slice's entry in `slice-plan.md`.
2. Write `docs/architecture/<NN>-slice-<slug>.md` (`<NN>` = zero-padded slice number, `<slug>` = kebab-cased name). Required sections: capability sentence, spec-section ref, layers changed, `/shared/` additions, architecture-doc updates, review outcomes, decisions/tradeoffs not visible from the diff, open follow-ups.
3. Append a row to `docs/architecture/README.md` linking the slice doc — same convention `/build-scaffold` uses for `scaffold-notes.md`.

The slice doc is a snapshot of *what happened during this slice*, not a living spec. Do not edit it when later slices change the same surface.

Then give a per-slice chat report: capability sentence, files changed grouped by layer, new `/shared/` entries (with consumers), architecture-doc updates, review outcomes.

### 11. Decide whether to continue

Check rare-gate triggers **before** asking the user:

| Gate                    | When                                                                              | Reviewer                  |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| **Product review**      | Just completed the last slice in a spec section                                   | Product + design (human)  |
| **Architecture review** | Slice swapped a mock for real impl, **or** completed slice count is divisible by 5 | Senior engineer (human)   |

- If a rare gate fires → **hard-STOP**. Print: which gate, why it fired, who needs to review, and which slice will resume the loop afterwards. Do **not** ask to continue. The user re-invokes `/build-application` after the human review.
- If no rare gate **and** slices remain → ask exactly: `Slice <n> done, reviews passed. Continue to slice <n+1>: <name>? (yes/no)`
- If all slices are completed → final report, **STOP**.

### 12. Handle the answer

- Unambiguous yes (`yes`, `y`, `continue`, `next`) → loop back to **step 3** with the next slice.
- Anything else (`no`, `stop`, `wait`, `hmm`, free-form, ambiguous) → **STOP** cleanly. Final report:
  - Slice just completed (status, review outcome).
  - Slices remaining in `slice-plan.md` (names, in order).
  - How to resume: re-invoke `/build-application` (picks up from first unstarted), or pass a specific slice name to jump.

Do not try to interpret the "no" further (don't branch into remediation, don't switch slices, don't edit `slice-plan.md`). Those are separate skills/actions.

## Do not

- Start without `/docs/architecture/` and `/shared/` in place.
- Silently invent a missing contract — surface and ask.
- Inline or duplicate anything already in `/shared/`.
- Expand a slice beyond the locked plan — update the doc first.
- Build horizontally (all of one layer, then the next).
- Bundle code review with product/architecture review.
- Atomize a slice into sub-slices — `slicing.md` grain is the contract.
- Bend a slice around an architecture defect — fix the doc instead.
- Auto-continue past a rare review gate — always hard-STOP.
- Continue on any answer that isn't an unambiguous yes.
- Mark a slice complete without its `docs/architecture/<NN>-slice-<slug>.md` doc and README index row.
