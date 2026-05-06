---
name: commit
description: Review-gated commit — runs /code-review and /security-review before allowing git commit. Use this instead of raw git commit, which is blocked by a hook.
version: "0.1"
---

# /commit — Review-gated commit

Every commit must pass both `/code-review` and `/security-review` before it is allowed. Direct `git commit` is blocked by a PreToolUse hook — this skill is the only way to commit code.

## Steps

### 1. Check for changes

- Run `git status` to verify there are staged or unstaged changes.
- If nothing to commit, stop and tell the developer.

### 2. Stage changes

- If `$ARGUMENTS` contains specific files, stage only those files.
- Otherwise, run `git add -A` to stage all changes.
- Show `git diff --cached --stat` so the developer can see what will be committed.
- Do NOT stage `.env`, credentials, or generated files (PDFs, coverage reports).

### 3. Run /code-review

- Execute the `/code-review` skill against the staged changes.
- Wait for the full outcome report.

### 4. Evaluate code-review results

- If any **High** severity findings remain unfixed:
  - Report the findings.
  - Tell the developer to run `/remediation` to fix the issues, then re-run `/commit`.
  - **STOP** — do not proceed to security review.
- If only **Medium** or **Low** findings:
  - Report them as warnings.
  - Proceed to step 5.

### 5. Run /security-review

- Execute the `/security-review` skill against the staged changes.
- Wait for the full outcome report.

### 6. Evaluate security-review results

- If any **Critical** or **High** findings:
  - Report the findings.
  - Tell the developer to run `/remediation` to fix the issues, then re-run `/commit`.
  - **STOP** — do not create the commit.
- If **Medium** findings:
  - Report each finding.
  - Ask the developer: "Do you acknowledge this risk?" for each.
  - If acknowledged, proceed. If not, **STOP**.
- If only **Low** findings:
  - Report for awareness, proceed.

### 7. Generate commit message

- Analyze the staged diff.
- Write a concise, imperative commit message using conventional format (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- Show the message to the developer and ask them to confirm or provide their own.

### 8. Unlock hook and commit

- Create the unlock file and run the commit in a single atomic shell invocation
  with a `trap` that guarantees the unlock file is removed regardless of how
  the shell exits (success, failure, signal, or interruption between steps):

  ```bash
  bash -c '
    trap "rm -f .claude/.commit-allowed" EXIT
    touch .claude/.commit-allowed
    git commit -m "<message with Co-Authored-By: Claude <noreply@anthropic.com>>"
  '
  ```

- The PreToolUse hook also self-deletes `.claude/.commit-allowed` the moment
  it reads the file, making the token one-shot at the hook layer too. The
  `trap` is defence-in-depth in case the commit never reaches the hook
  (e.g. a typo causes git to abort before PreToolUse fires).
- Never `touch .claude/.commit-allowed` outside this atomic block — leaving
  the file on disk between turns lets a subsequent raw `git commit` slip past
  the gate.

### 9. Report

- Show the commit SHA and a summary of what was committed.
- If any Medium/Low findings were accepted, list them as post-commit notes.

## Important

- This skill is the **only way** to commit code in this project.
- Raw `git commit` commands are blocked by a PreToolUse hook and will be rejected.
- If reviews fail, the developer must run `/remediation` and then re-run `/commit`.
- Always create and remove `.claude/.commit-allowed` inside a single `bash -c` invocation with a `trap ... EXIT` so the file is cleaned up even if the shell is interrupted between steps. The hook also self-deletes the file on read as a second line of defence.
