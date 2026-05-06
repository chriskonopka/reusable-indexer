---
name: security-review
description: Reviews code changes for security vulnerabilities including XSS, exposed secrets, insecure storage, authentication flaws, and dependency risks. Do NOT use for code quality or standards checks — use /code-review for that.
version: "0.1"
---

# /security-review — Multi-layer security review

Reviews staged or changed files for security vulnerabilities using the OWASP Top 10 framework. Routes to the appropriate checklist based on which files changed.

## Review Process

1. Run `git diff --cached --name-only` to identify staged files. If nothing is staged, fall back to `git diff --name-only` for unstaged changes.
2. If $ARGUMENTS is provided, review only that specific file or finding.
3. Identify which layers are affected:
   - `**/*.tsx`, `**/*.ts` (under `client/` or `src/` frontend dirs), `**/*.scss`, `**/*.css` → read and apply @web-frontend-security.md
   - `**/*.cs`, `**/*.csproj`, `**/appsettings*.json`, `**/Dockerfile`, `**/Program.cs`, `**/NuGet.Config` → read and apply @api-middletier-security.md
   - `sql/**`, `migrations/**`, `**/*.sql` → read and apply @database-backend-security.md
   - If multiple layers are affected, run all applicable reviews
4. Classify each finding by severity.
5. Apply blocking rules.
6. Generate the Outcome Report.

## Severity and Blocking Policy

| Severity | Criteria | Blocks Commit? |
|----------|----------|----------------|
| **Critical** | Actively exploitable vulnerability, exposed secrets, credential leaks | Yes |
| **High** | XSS vectors, authentication bypasses, insecure data exposure | Yes |
| **Medium** | Missing security headers, misconfiguration, weak defaults | No — requires developer acknowledgment |
| **Low** | Best practice improvements, defense-in-depth suggestions | No — reported for awareness |

## Actions After Review

- For **Critical** and **High** findings: apply the fix using the appropriate remediation logic (via /remediation), and ask the developer for approval. Block the commit until resolved.
- For **Medium** findings: propose the fix, require the developer to explicitly acknowledge the risk if they choose not to fix.
- For **Low** findings: include in the report only. Developer decides when to address.

## Outcome Report

For each finding:

```
**Finding #[n]**
- OWASP Category: [A01–A10 with name]
- Severity: [Critical | High | Medium | Low]
- File: [fileName]
- Line: [lineNumber]
- Issue: [description of the vulnerability]
- Code: [snippet showing the vulnerable pattern]
- Fix: [what was changed or what needs to change]
- Status: [Fixed | Pending Approval | Requires Manual Fix | Acknowledged]
```

**Review Summary**
- Total findings: [n]
- Critical: [n] — Commit blocked: [Yes | No]
- High: [n] — Commit blocked: [Yes | No]
- Medium: [n] — Acknowledged: [Yes | No]
- Low: [n]
- Overall status: [PASS | FAIL]
  - PASS = zero Critical and zero High findings
  - FAIL = one or more Critical or High findings

## Security Checklists

- Frontend (React / TypeScript / Node): @web-frontend-security.md
- Middle Tier (.NET / Azure): @api-middletier-security.md
- Backend (SQL Server / Database): @database-backend-security.md
