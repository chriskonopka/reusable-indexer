# `/review-and-remediate` — Quickstart

Bounded review + remediation pipeline. Runs code-review + security-review against your recent work, auto-fixes mechanical findings, pauses for your decision on anything architectural, and records everything under `reviews/`.

## Invoke

```
/review-and-remediate
```

No arguments needed. Scope and filenames are derived from your git state.

## What happens

1. **Pre-flight** — skill reads the architecture docs, `/shared/` contracts, and the prior architectural-findings ledger so it knows what's already been decided.
2. **Iteration 1** — runs code review + security review against your changed files. Auto-applies mechanical fixes (missing attribute, wrong naming, `ConfigureAwait`, etc.) and reports them.
3. **Architectural prompt** — if there are structural findings, the skill pauses and shows them to you in a numbered list. Reply per finding:
   - `apply 1, apply 3` — skill implements the fix
   - `defer 2` — skill logs it, re-proposes on your next run
   - `reject 4 (reason: ...)` — skill logs it, never asks again for this file+rule
   - Shortcuts: `apply all` / `defer all` / `reject all`
4. **Iterations 2–5** — re-runs the reviews to verify the fixes landed and catch anything introduced by remediation. Stops on clean, stuck, or cap.
5. **Outputs** — permanent artefacts in `reviews/`:
   - `code-review-findings/<label>.md` — per-run code review
   - `security-review-findings/<label>.md` — per-run OWASP review
   - `remediations-applied/<label>.md` — per-run fix log
   - `iteration-log/<label>.md` — iteration-by-iteration summary
   - `architectural-findings.md` — cumulative ledger of every architectural decision
   - `deferred-architectural.md` — auto-filtered view of items still deferred

## A typical session, start to finish

**1. Finish a chunk of work.** You've been coding on a feature. Files are staged, unstaged, or a mix — doesn't matter. You don't have to commit first.

**2. Invoke the skill.**
```
/review-and-remediate
```

**3. Pre-flight runs silently** (2–5 seconds). Skill reads the architecture docs, loads only the checklists matching the layers you touched, reads the prior architectural-findings ledger so previously-decided findings aren't re-raised, and figures out scope from `git diff` + `git status`. Auto-generates a label (e.g. from branch `feat/pdf-export` → `feat-pdf-export-a3f7e2c`).

**4. Code review + security review run.** You see something like:

```
Iteration 1 — scoped to 4 files (label: feat-pdf-export-a3f7e2c)

Code findings: 3 (1 High, 2 Medium)
Security findings: 0

Auto-applying 2 mechanical fixes...
 ✓ Added [RequestSizeLimit(64 * 1024)] to ExportController.cs
 ✓ Added ConfigureAwait(false) to 3 awaits in ExportService.cs

1 architectural finding awaiting your decision:

[1] A.C.1 — ExportPanel.tsx is 210 lines. Rule says split components above 150 lines.
    File:           web/src/features/Export/ExportPanel.tsx
    Rule:           web-component-architecture.md#component-length
    Why it matters: Readability + single-responsibility.
    Proposed fix:   Split into ExportForm, FormatPicker, DownloadStatus sub-components.
    Match key:      web/src/features/Export/ExportPanel.tsx::web-component-architecture.md#component-length

Reply per finding:
  "apply 1"     — I implement the fix now
  "defer 1"     — log it, re-propose on your next run
  "reject 1 (reason: ...)"  — log it, never re-raise for this file+rule
```

**5. Reply with a one-liner.** Any of these work:

- `apply 1`
- `defer 1`
- `reject 1 (reason: keep it as one form, split is premature)`
- Shortcuts when there are many: `apply all`, `defer all`, `reject all`

**6. Skill applies your decision and re-scans** (iteration 2). If clean, it stops. Otherwise it loops up to 4 more times (max 5 iterations).

**7. Final summary:**

```
✅ Review + remediation complete — feat-pdf-export-a3f7e2c

Iterations: 2 of 5 (CLEAN)
Code findings fixed:     3 (1 High, 2 Medium)
Security findings:       0
Architectural decisions: 1 Applied, 0 Deferred, 0 Rejected

Full details:
  reviews/iteration-log/feat-pdf-export-a3f7e2c.md

Ready to /commit or /ship.
```

**8. Commit.** Either `/commit` (runs the review gate again and commits) or plain `git commit`. Up to you.

Zero arguments to remember. The only thing you actively decide is **apply / defer / reject** on each architectural finding — everything else is automatic.

## When to run it

Any time between "I think I'm done with this chunk of work" and "I'm about to commit." Works both **pre-commit** (against your uncommitted changes) and **post-commit** (against recent commits since the last run). The skill detects which mode it's in from `git status`.

## Common overrides (rarely needed)

| Flag | When you'd use it |
|---|---|
| `--label my-name` | Override the auto-generated filename prefix. |
| `--scope files:path/**` | Re-review a specific area on demand. |
| `--scope since:2026-04-15` | Review everything changed since a date. |
| `--force` | Overwrite existing output files with the same label. |
| `--max-iterations 3` | Shrink the 5-iteration default. |

## Pairs well with

- [`/code-review`](../code-review/SKILL.md) — run standalone without remediation.
- [`/security-review`](../security-review/SKILL.md) — OWASP pass only.
- [`/remediation`](../remediation/SKILL.md) — apply a fix to a specific finding.
- [`/commit`](../commit/SKILL.md) — gated commit, to follow after this skill clears.

## Full contract

See [`SKILL.md`](SKILL.md) for the complete spec — scope derivation, label heuristic, watermark semantics, stop conditions, edge cases.
