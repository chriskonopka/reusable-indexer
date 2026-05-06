#!/bin/bash
# Pre-compact hook: pauses compaction so Claude can save a context summary.
# - Fresh summary exists (< 2 min old) → allow compaction (exit 0)
# - No fresh summary, first block   → block compaction (exit 2), create lock
# - No fresh summary, lock exists    → allow compaction anyway (failsafe)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SUMMARY_FILE="${PROJECT_DIR}/.claude/compact-summary.md"
LOCK_FILE="${PROJECT_DIR}/.claude/.compact-lock"

# Failsafe: if we already blocked once, remove lock and allow compaction
if [ -f "$LOCK_FILE" ]; then
  rm -f "$LOCK_FILE"
  exit 0
fi

# If a fresh summary exists (written within the last 2 minutes), allow compaction
#
# Portable mtime read: try GNU stat (-c %Y), then BSD stat (-f %m). Both
# variants are tried with stderr suppressed so the wrong one fails silently.
# Final fallback (if neither stat works — exotic environments) uses
# `find -newermt` to test the freshness window directly without parsing mtime.
if [ -f "$SUMMARY_FILE" ]; then
  file_mod=""
  if file_mod=$(stat -c %Y "$SUMMARY_FILE" 2>/dev/null); then
    : # GNU stat (Linux, Git Bash on Windows)
  elif file_mod=$(stat -f %m "$SUMMARY_FILE" 2>/dev/null); then
    : # BSD stat (macOS)
  fi

  if [ -n "$file_mod" ]; then
    now=$(date +%s)
    age=$(( now - file_mod ))
    if [ "$age" -lt 120 ]; then
      exit 0
    fi
  else
    # Neither stat variant worked — use find as a portable freshness test.
    # If the file was modified within the last 2 minutes, find prints its path.
    if find "$SUMMARY_FILE" -mmin -2 2>/dev/null | grep -q .; then
      exit 0
    fi
  fi
fi

# No fresh summary — block compaction and leave a lock so the next attempt passes
touch "$LOCK_FILE"

cat >&2 << 'INSTRUCTIONS'
CONTEXT COMPACTION PAUSED — action required before compaction can proceed.

Write a context summary to .claude/compact-summary.md using the Write tool. This file will be re-injected after compaction so you can pick up where you left off.

Required sections:

## Current Task
What you are working on and the overall goal.

## Progress
What has been completed so far.

## Key Decisions
Important choices made during this session and their reasoning.

## Modified Files
Files created, changed, or deleted (with brief description of each change).

## Remaining Work
Next steps, in order, to complete the task.

## Gates Status
REQUIRED — record the exact status of every quality gate for the area you were working in.
Do not skip this section. Do not write "unknown" — run the gate if you have not already.

For web/ work:
- npm run lint:         [ PASS | FAIL | NOT RUN ] — (note error count if FAIL)
- npx tsc --noEmit:    [ PASS | FAIL | NOT RUN ]
- npm test:            [ PASS | FAIL | NOT RUN ] — (note failing suite names if FAIL)
- npm run test:e2e:    [ PASS | FAIL | NOT RUN ]
- Untested files:      [ NONE | list any src files that lack a .test counterpart ]

For api/ work:
- dotnet build:        [ PASS | FAIL | NOT RUN ]
- dotnet test:         [ PASS | FAIL | NOT RUN ]

For database/ work:
- tSQLt tests:         [ PASS | FAIL | NOT RUN ]
- Migration idempotency checked: [ YES | NO ]

## Critical Context
Anything else that would be lost — error messages being debugged, user preferences stated in this session, constraints discovered, etc.

After writing the summary, continue your work normally. Compaction will proceed on the next cycle.
INSTRUCTIONS

exit 2
