---
name: review-and-remediate
description: Automated quality-gate pipeline — runs code-review + security-review in a bounded iteration loop, auto-remediates mechanical findings, surfaces architectural findings for per-item developer decision, and writes durable artefacts under /reviews/. Zero required inputs; scope and labelling are derived from git state.
version: "2.0"
---

# /review-and-remediate — Bounded review + remediation loop

Runs `/code-review` + `/security-review` + `/remediation` in a **bounded loop** (max 5 iterations) against a work item, auto-applies mechanical fixes, pauses for per-item developer decisions on architectural fixes, and records every action as a durable artefact under `/reviews/`.

Designed for both **hands-on** and **end-to-end automation** flows. In the common case the invocation is one command with no arguments; the skill figures out scope, filenames, and stopping conditions from git state.

---

## Invocation

### Zero-argument default (the 95% case)

```
/review-and-remediate
```

No inputs. The skill derives:

- **Scope** — files changed since the last successful run's HEAD SHA (via `reviews/.watermark.json`) union any uncommitted files.
- **Label** — auto-generated from branch name, commit subject, or a wip-stamp depending on whether there are uncommitted changes (see Auto-labelling below).

### Optional overrides

| Flag | Effect |
|---|---|
| `--label <string>` | Override the auto-generated label; used only for output filenames. |
| `--scope files:<glob>` | Override scope to an explicit file glob (re-review an earlier area). |
| `--scope since:<date>` | Override scope to files changed since an ISO date (`2026-04-15`, `2026-04-15T09:00:00Z`). |
| `--force` | Overwrite existing per-run output files if the label collides. |
| `--max-iterations <n>` | Override the default 5-iteration cap (rarely needed). |

Overrides are independent and can be combined.

---

## Pre-flight (every run)

1. **Load context.** Read `docs/architecture/README.md` + every numbered doc under `docs/architecture/`. Read the full `shared/` tree so you know what types, constants, and contracts already exist.
2. **Load checklists.** Based on the scoped file set, load only the checklists relevant to the changed layers:
   - Database files (`.sql`, `database/migrations/**`) → `.claude/skills/code-review/database-backend.md` + `.claude/skills/security-review/database-backend-security.md`
   - API files (`.cs`, `Program.cs`, `Dockerfile`, `appsettings*.json`) → `.claude/skills/code-review/api-middletier.md` + `.claude/skills/security-review/api-middletier-security.md`
   - Frontend files (`.ts`, `.tsx`, `.scss`, `.css`) → `.claude/skills/code-review/web-frontend.md` + `.claude/skills/security-review/web-frontend-security.md`
3. **Load remediation logic.** `.claude/skills/remediation/SKILL.md` + the layer-specific `*-remediation-logic.md` files that match the scope.
4. **Load prior architectural decisions.** Read `reviews/architectural-findings.md` (if present) to build an in-memory map of `<file + rule> → decision` so previously-rejected findings are not re-raised.

---

## Scope derivation

### Primary — watermark diff

Read `reviews/.watermark.json`:

```json
{
  "last_head_sha": "a3f7e2cb9d4f11...",
  "last_run_timestamp": "2026-04-23T14:30:00Z",
  "last_label": "feat-conversations-crud-a3f7e2c",
  "last_status": "clean"
}
```

- **Scope** = `git diff <last_head_sha>..HEAD --name-only` **union** `git status --porcelain` (uncommitted staged + unstaged files).
- Missing / corrupted watermark → fall back to `git diff --name-only` (staged + unstaged).
- Watermark points to a commit that no longer exists (history rewrite) → warn, ignore watermark, fall back to `git diff --name-only`, advise the developer to commit and re-run.

### Override — `--scope files:<glob>` or `--scope since:<date>`

- `files:` overrides watermark entirely; scope is the literal glob expansion.
- `since:` scope = `git log --since=<date> --name-only --pretty=format:`.

### Filtering

Regardless of scope source, drop files that belong to:

- `.claude/` (tooling)
- `docs/architecture/` (architecture docs are updated *by* the skill, not *reviewed* as code)
- `reviews/` (skill outputs)
- `prompts/` (skill definitions and templates)
- Lockfiles (`package-lock.json`, `*.sum`, `Cargo.lock`, etc.)

### Empty scope

If scope is empty after filtering, exit with "Nothing to review — no changes since `<last_label>` (SHA `<last_head_sha>`)." Do not create any output files.

---

## Auto-labelling

The label is used only to name this run's output files. The skill detects whether there are uncommitted changes and picks the label source accordingly.

### Step 1 — Detect mode

- If `git status --porcelain` is **non-empty** → **pre-commit mode**. The latest commit describes previous work, not this review. Use a different source.
- If `git status --porcelain` is **empty** → **post-commit mode**. The latest commit describes the work being reviewed. Use its subject.

### Step 2 — Pick the source (first one that yields a meaningful slug wins)

**Pre-commit mode** — try in order:

1. **Branch name** via `git rev-parse --abbrev-ref HEAD`.
   - Skip if it's a generic trunk name: `main`, `master`, `develop`, `trunk`, `HEAD`, detached-head state.
   - Slugify: lower-case; `/` and non-alphanum → `-`; collapse repeated `-`; strip leading/trailing `-`; truncate to 40 chars.
   - Example: `feat/export-pdf` → `feat-export-pdf`.
2. **Dominant file-path prefix** from the scoped file list.
   - Pick the deepest common prefix that isn't a top-level directory (skip bare `api/`, `web/`, `database/`).
   - Slugify the leaf segment.
   - Example: scope = `api/src/Atticus.Api/Features/Export/*.cs` + `web/src/features/Export/*.tsx` → `export`.
3. **wip-stamp** as final fallback.
   - Format: `wip-<YYYYMMDD>-<HHMM>-<git_user_slug>`.
   - Example: `wip-20260423-1430-nagarjuna`.

**Post-commit mode** — one source:

1. **Latest commit subject** via `git log -1 --pretty=format:%s`.
   - Slugify same as branch name.
   - Example: `"feat: conversations CRUD"` → `feat-conversations-crud`.

### Step 3 — Append a short SHA for uniqueness

Always append `-<short_sha>` where `short_sha = git rev-parse --short HEAD`. If no commits yet, omit the SHA.

### Examples

| Situation | Source used | Final label |
|---|---|---|
| On branch `feat/export-pdf`, uncommitted work, HEAD `a3f7e2c` | Branch name | `feat-export-pdf-a3f7e2c` |
| On `main`, uncommitted work, all files under `api/.../Export/` | File-path prefix | `export-a3f7e2c` |
| On `main`, uncommitted work, files scattered across the repo | wip-stamp | `wip-20260423-1430-nagarjuna` |
| Clean working tree, HEAD subject `"feat: conversations CRUD"` | Commit subject | `feat-conversations-crud-a3f7e2c` |

### Collision handling

If `reviews/code-review-findings/<label>.md` already exists:

- Without `--force` → abort with "Label collision: `<label>` already reviewed. Pass `--force` to overwrite, or `--label <new>` to file separately."
- With `--force` → overwrite; the previous iteration log's contents are lost (they are per-run anyway).

---

## Iteration loop

Run iterations `1..MAX_ITERATIONS` (default 5). Each iteration is one complete pass of steps 1–5 below. After each iteration, evaluate the **stop conditions**.

### Step 1 — Code review

- Apply the basic + advanced checklists for each affected layer to every file in scope.
- Classify each finding as **High**, **Medium**, or **Low**.
- Flag each finding with a **fix class**: `Mechanical` or `Architectural`.
- Append findings to `reviews/code-review-findings/<label>.md` under heading `## Iteration <N>`. Include file, line, severity, fix class, rule reference, issue, proposed fix.

### Step 2 — Security review

- Walk OWASP A01–A10 + advanced / container / data-protection sections for each affected layer.
- Classify each finding as **Critical**, **High**, **Medium**, or **Low**.
- Flag each finding with a **fix class**: `Mechanical`, `Architectural`, or `Pending-decision` (for product trade-offs that only the developer can make, e.g. MSAL token cache location).
- Append to `reviews/security-review-findings/<label>.md` under `## Iteration <N>`.

### Step 3 — Load prior decisions and skip already-resolved findings

For every new finding, compute its match key:

```
<file_path>::<rule_reference>
```

Example: `web/src/features/ConversationSidebar/index.tsx::web-component-architecture.md#component-length`.

Cross-reference against `reviews/architectural-findings.md`:

- Match exists with status `Applied` → mark as resolved (stale finding; possibly a rule-scan false positive on a fix that hasn't propagated).
- Match exists with status `Rejected` → **silently skip** in this iteration; do not re-surface.
- Match exists with status `Deferred` → surface to developer with annotation `"Previously deferred on <date>. Still deferred?"` — giving them a second look on each new run.
- No match → treat as newly surfaced.

### Step 4 — Remediate

In severity order (Critical → High → Medium → Low):

#### 4a — Mechanical fixes: auto-apply

- Apply the fix using the relevant `*-remediation-logic.md` pattern.
- Read the file after edit to confirm the change landed as intended.
- Record status `Applied` in `reviews/remediations-applied/<label>.md` under `## Iteration <N>`.

#### 4b — Architectural fixes: surface and wait

After all mechanical fixes are applied, batch all architectural findings into one message to the developer:

```
Iteration <N> — architectural findings awaiting your decision (<count>):

[1] <finding_id> — <one-line summary>
    File:           <file_path>
    Rule:           <rule_reference>
    Why it matters: <one-sentence why>
    Proposed fix:   <one-sentence what>
    Match key:      <file>::<rule>

[2] ...

Reply per finding:
  "apply 1, defer 2, reject 3 (reason: ...)"
or a shortcut:
  "apply all"
  "defer all"
  "reject all"
```

Parse the reply. For each finding:

- **Apply** → implement the fix, verify, record `Applied` in the ledger + remediation log.
- **Defer** → record `Deferred` in the ledger; include the date; finding will be re-proposed on the next run.
- **Reject** → record `Rejected` + optional reason in the ledger; finding will never be re-raised for the same match key until the ledger entry is manually cleared.

If the developer does not reply, the iteration pauses indefinitely. Findings stay `Pending` in the iteration log. Resuming the session with another invocation re-surfaces them.

#### 4c — Pending-decision findings: surface without fix

Security findings with product trade-offs (e.g. MSAL localStorage vs sessionStorage) are presented similarly but without a pre-written fix — they need the developer to pick a direction. Responses `approve A` or `approve B` unblock, with the chosen fix applied on the next iteration.

### Step 5 — Update the architectural ledger

`reviews/architectural-findings.md` is the canonical, append-only ledger of every architectural finding that has ever surfaced. Every row has:

```
| Match Key | First Seen | Status | Decided At | Rule | File | Reason |
|-----------|------------|--------|------------|------|------|--------|
| web/src/.../ConversationSidebar/index.tsx::web-component-architecture.md#component-length
| 2026-04-23 | Rejected | 2026-04-23 | component-length | web/.../index.tsx | "Split is premature; revisit after messages slice." |
```

After the iteration, **regenerate** `reviews/deferred-architectural.md` as the filtered view of all rows with `Status = Deferred`. This is a view file — never hand-edited.

### Stop conditions (evaluated at end of each iteration)

Stop the loop when any of the following is true:

1. **Clean** — zero open findings of any severity or class. "Open" excludes findings in `Applied`, `Rejected`, or `Deferred` status from prior decisions in this run or prior runs. This is the success path.
2. **Stuck** — the set of open-finding match keys at end of iteration N is identical to the set at end of iteration N-1. This indicates remediation is not reducing the problem set (e.g. a fix introduces the same issue in a new form). Stop and escalate.
3. **Cap** — iteration count == `MAX_ITERATIONS`. Stop and escalate.

On escalate (`Stuck` or `Cap`): write `## Final Status: UNRESOLVED` to the iteration log with the open findings list, and surface a summary to the developer.

---

## Output contract

After a successful run, the following paths exist / are updated:

```
reviews/
├── code-review-findings/<label>.md         (one file per run; per-iteration sections)
├── security-review-findings/<label>.md     (one file per run; per-iteration sections)
├── remediations-applied/<label>.md         (one file per run; per-iteration sections)
├── iteration-log/<label>.md                (one file per run; iteration-by-iteration record)
├── architectural-findings.md               (cumulative ledger; append-only)
├── deferred-architectural.md               (auto-regenerated view of `Deferred` rows)
└── .watermark.json                         (atomic update at end of run)
```

### Iteration log structure

```markdown
# <label> — iteration log

**Label:** feat-conversations-crud-a3f7e2c
**Scope source:** watermark (a3f7e2c..HEAD)
**Files reviewed:** 28
**Started:** 2026-04-23T14:30:00Z
**Ended:** 2026-04-23T14:34:12Z
**Final status:** CLEAN | UNRESOLVED-STUCK | UNRESOLVED-CAP

## Iteration 1 — <N_C> code findings, <N_S> security findings
- Auto-applied: <M_list>
- Architectural surfaced: <A_list>
- Developer decisions: apply 1,3; defer 2; reject 4 (reason: ...)
- End-of-iteration open set: <hash>

## Iteration 2 — ...

## Final Status: CLEAN
- Total iterations: 2
- Total findings fixed: 8
- Architectural deferred: 1
- Architectural rejected: 1
```

---

## Watermark lifecycle

- **Read** during pre-flight — determines scope.
- **Written atomically** at the end of every run that completes with status `CLEAN` or `UNRESOLVED-<kind>` **only if the current HEAD SHA differs from the last watermarked SHA**.

Why the "only if HEAD moved" condition: running the skill pre-commit doesn't advance HEAD. Updating the watermark pre-commit would effectively say "I've reviewed everything up to `A`" even though `A` is the same as last time — no information gain, and it would mis-attribute the next run's scope. By only moving the watermark when HEAD has moved, we keep the watermark meaningfully aligned with committed history.

New watermark:
```json
{
  "last_head_sha": "<current HEAD SHA>",
  "last_run_timestamp": "<ISO 8601 UTC>",
  "last_label": "<label>",
  "last_status": "clean | unresolved-stuck | unresolved-cap"
}
```

**Do not update the watermark** if the run aborted before completing iteration 1 (e.g. scope was empty, or the developer interrupted before the first findings were recorded). This preserves scope continuity — the next run will pick up where this one started.

---

## Edge cases

| Case | Behaviour |
|---|---|
| No watermark file | First-run mode: fall back to `git diff --name-only`; auto-label from branch or wip-stamp. |
| Watermark SHA no longer exists | Warn, ignore watermark, fall back to `git diff --name-only`. Suggest developer commit and re-run. |
| Empty scope after filtering | Exit with "Nothing to review — no changes since `<last_label>`." No files written. Watermark not updated. |
| Label collision without `--force` | Abort with clear error; suggest `--force` or `--label`. |
| Developer reply is ambiguous on architectural findings (e.g. `"approve"` without numbers) | Ask for clarification; do not guess. |
| Remediation introduces a new finding of the same kind (oscillation) | Detected by the `Stuck` stop condition. Escalate. |
| Rule file changed between iterations | Rule reference in match key is stable as a path; if the rule file is renamed, match-key lookup will miss and the finding will surface fresh. This is correct behaviour — the rule changed. |
| Architecture doc update required during remediation | Stop. Update the relevant `docs/architecture/` file first, surface the change to the developer, wait for explicit acknowledgement before proceeding. |

---

## What this command does NOT do

- Does **not** commit, push, or open a PR. Stops at the review/fix boundary. Compose with `/commit` or `/ship` afterwards.
- Does **not** run in the background. Architectural decisions require a live developer; attempting to run unattended with architectural findings present will stall at the first decision prompt.
- Does **not** touch `docs/architecture/`, `/shared/`, or any locked signature without first updating the architecture doc and surfacing the change.
- Does **not** clear rejections automatically. Manually remove entries from `reviews/architectural-findings.md` if you want a previously-rejected finding reconsidered.

---

## Resume behaviour

If the run is interrupted (developer closes the session mid-iteration):

- Files already written to `reviews/` stay on disk.
- Code edits already applied stay applied.
- Watermark is **not** updated (only written at end-of-run).
- Re-invoking the skill with no arguments resumes from the same scope (watermark still points to the previous baseline). The new run starts from iteration 1 against the same file set, which is safe: previously-applied fixes won't re-trigger (they resolved the rule), and pending architectural decisions re-surface because the ledger shows them as still open.
