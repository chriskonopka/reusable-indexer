---
name: ship
description: Full ship workflow — stage, review, commit, push, and create a pull request. Stops at PR creation — does NOT merge.
version: "0.1"
---

# /ship — Ship changes to a pull request

Automates the full feature branch workflow: stage changes, run reviews via `/commit`, push, and create a pull request. Stops at PR creation — merging is left to the developer.

## Steps

### 1. Guard: branch check

- Run `git branch --show-current`.
- If the current branch is `main` or `master`:
  - **STOP** with error: "Cannot ship from the default branch. Create a feature branch first."
  - Suggest: `git checkout -b feature/<name>`

### 2. Show what will be shipped

- Run `git status` to show all changed/untracked files.
- Run `git diff --stat` for a summary of changes.
- If there are no changes to commit, report and **STOP**.

### 3. Commit via /commit

- Invoke the `/commit` skill.
- This runs `/code-review` and `/security-review` internally.
- If `/commit` fails (reviews have blocking findings), **STOP**.
- The entire review-gate workflow executes here — do not duplicate it.

### 4. Push

- Run `git push -u origin <current-branch>`.
- If the push fails, report the error and **STOP**.

### 5. Create pull request

- Detect the default branch: `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`.
- Create the PR:
  ```bash
  gh pr create \
    --title "<title derived from commit message or branch name>" \
    --body "<summary of changes>"
  ```
- PR body should include:
  - A brief summary of the changes (2-3 bullet points).
  - Any review warnings that were acknowledged (Medium/Low findings).
  - Test plan or verification steps.

### 6. Report

- Display the PR URL.
- **STOP** — do NOT merge the PR. It is ready for human review.

## Prerequisites

- **GitHub CLI** (`gh`) must be installed and authenticated.
- Must be on a **feature branch** (not main/master).
- Must have **changes to commit**.

## Important

- This skill calls `/commit`, which calls `/code-review` and `/security-review`. Do not run reviews separately before `/ship` — it handles everything.
- If `gh` is not installed or not authenticated, report the error and suggest the developer install/configure it.
- Never force-push. If the push fails due to upstream changes, tell the developer to pull and rebase first.
