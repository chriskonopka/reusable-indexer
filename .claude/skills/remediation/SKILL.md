---
name: remediation
description: Fixes issues found by /code-review, /security-review, or external security scanners (GitLeaks, SonarQube, Dependabot). Use when applying a fix to a reported finding, whether from an internal review or an external pipeline scan.
version: "0.1"
---

# /remediation — Fix review and scanner findings

Applies fixes to issues identified by `/code-review`, `/security-review`, or external tools (GitLeaks, SonarQube, Dependabot, `npm audit`, `dotnet list package --vulnerable`).

## Input Sources

1. **Internal** — structured outcome report from `/code-review` or `/security-review` (includes file, line, severity, finding).
2. **External** — raw output or description from GitLeaks, SonarQube, Dependabot alerts, or `npm audit`. May require additional context-gathering.

## Workflow

1. **Parse the finding** from `$ARGUMENTS`:
   - If it includes structured context (file, line, component) → it came from an internal review. Locate the code directly.
   - If it's a raw error description → it came from an external scanner. Read the referenced file to gather context. If there's not enough context, ask the developer.

2. **Classify the fix type**:
   - **Auto-fixable**: mechanical issues with a clear, deterministic fix (see lists below).
   - **Manual**: complex issues requiring developer judgment or architectural decisions.

3. **For auto-fixable issues**:
   a. Apply the fix.
   b. Show the before/after diff.
   c. Ask the developer for approval.
   d. If rejected, revert and flag for manual review.

4. **For manual issues**:
   a. Describe the problem with full context.
   b. Suggest a remediation approach with code examples.
   c. Reference the relevant rule or security checklist item.
   d. Leave the implementation to the developer.

5. **After all fixes**, re-run the appropriate review (`/code-review` or `/security-review`) to verify the fixes resolved the findings.

## Fix Logic References

### Frontend (React / TypeScript / Webpack)
- Code quality findings → @web-frontend-remediation-logic.md
- Security findings → @web-security-remediation-logic.md

### Middle Tier (.NET / Azure)
- Code quality findings → @api-middletier-remediation-logic.md
- Security findings → @api-security-remediation-logic.md

### Backend (SQL Server / Database)
- Code quality findings → @database-backend-remediation-logic.md
- Security findings → @database-security-remediation-logic.md

## Outcome Report

For each finding addressed:

```
**Finding #[n]**
- Issue: [the original finding]
- File: [fileName]
- Line: [lineNumber]
- Source: [Internal (/code-review or /security-review) | External (tool name)]
- Fix: [what was changed]
- Status: [Fixed | Pending Approval | Requires Manual Fix]
```
