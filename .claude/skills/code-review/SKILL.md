---
name: code-review
description: Reviews code changes for quality, standards compliance, naming conventions, error handling, and test coverage gaps. Do NOT trigger for security vulnerability scanning — that is handled by /security-review.
version: "0.1"
---

# /code-review — Multi-layer code review

Reviews staged or changed files against the project's engineering rules and best practices. Routes to the appropriate review checklist based on which files changed.

## Review Process

1. Run `git diff --cached --name-only` to identify staged files. If nothing is staged, fall back to `git diff --name-only` for unstaged changes.
2. If $ARGUMENTS is provided, review only that specific file or component.
3. Identify which layers are affected:
   - `**/*.tsx`, `**/*.ts` (under `client/` or `src/` frontend dirs), `**/*.scss`, `**/*.css` → read and apply @web-frontend.md
   - `**/*.cs`, `**/*.csproj`, `**/appsettings*.json`, `**/Dockerfile`, `**/Program.cs` → read and apply @api-middletier.md
   - `sql/**`, `migrations/**`, `**/*.sql` → read and apply @database-backend.md
   - If multiple layers are affected, run all applicable reviews
4. For each changed file, run the **Basic Code Review** checks from the applicable checklist.
5. For each changed file, run the **Advanced Code Review** checks from the applicable checklist.
6. Aggregate all findings with severity classifications.
7. Apply actions based on severity (see below).
8. Generate the Outcome Report.

## Severity Definitions

| Severity | Criteria |
|----------|----------|
| **High** | Violates project rules, will cause bugs, breaks functionality, missing required tests, architecture violations |
| **Medium** | Deviates from conventions but doesn't break functionality (naming, missing memoization, style violations) |
| **Low** | Style preferences, minor improvements, missing comments on complex logic |

## Actions After Review

- **Simple, mechanical issues** (naming, missing attributes, formatting, import paths): apply the fix, show the diff, and ask the developer for approval before finalizing.
- **Complex issues** (architecture restructuring, state management changes, performance redesign): report the finding with a clear explanation and recommended approach — leave the fix to the developer.

## Outcome Report

Generate a report at the end of the review. For each finding:

```
**Finding #[n]**
- File: [fileName]
- Line: [lineNumber]
- Severity: [High | Medium | Low]
- Rule: [which rule file or checklist item was violated]
- Issue: [description of the violation]
- Code: [snippet showing the problem]
- Fix: [what was changed or what needs to change]
- Status: [Fixed | Pending Approval | Requires Manual Fix]
```

**Review Summary**
- Total findings: [n]
- High: [n]
- Medium: [n]
- Low: [n]
- Auto-fixed: [n]
- Requires manual fix: [n]

## Review Checklists

- Frontend (React / TypeScript / Webpack): @web-frontend.md
- Middle Tier (.NET / Azure): @api-middletier.md
- Backend (SQL Server / Database): @database-backend.md
