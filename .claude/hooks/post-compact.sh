#!/bin/bash
# Post-compact hook: re-injects the pre-compaction context summary into
# Claude's conversation so work can continue without context loss.
# Also runs a rules compliance check to surface any gates that were not
# verified before compaction, and any source files missing test coverage.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SUMMARY_FILE="${PROJECT_DIR}/.claude/compact-summary.md"

if [ ! -f "$SUMMARY_FILE" ]; then
  echo "No pre-compaction summary found. Review recent git history and task list to rebuild context."
  exit 0
fi

cat << 'HEADER'
============================================================
 RESTORED CONTEXT — saved before the last context compaction
============================================================

HEADER

cat "$SUMMARY_FILE"

cat << 'FOOTER'

============================================================
 END RESTORED CONTEXT
============================================================

Use the summary above to continue where you left off. Verify any file paths or line numbers mentioned — they may have changed.
FOOTER

# ============================================================
#  RULES COMPLIANCE CHECK
# ============================================================

echo ""
echo "============================================================"
echo " RULES COMPLIANCE CHECK"
echo "============================================================"
echo ""

# --- 1. Extract and highlight the Gates Status section ---
GATES_SECTION=""
if grep -q "^## Gates Status" "$SUMMARY_FILE" 2>/dev/null; then
  # Extract everything between "## Gates Status" and the next "##" heading
  GATES_SECTION=$(awk '/^## Gates Status/{found=1; next} /^## /{if(found) exit} found{print}' "$SUMMARY_FILE")
fi

if [ -n "$GATES_SECTION" ]; then
  echo "Gate status recorded before compaction:"
  echo "$GATES_SECTION" | while IFS= read -r line; do
    # Flag any gate that was NOT RUN or FAIL
    if echo "$line" | grep -qiE "NOT RUN|FAIL|NONE"; then
      echo "  ⚠  $line"
    elif echo "$line" | grep -qiE "PASS|YES"; then
      echo "  ✅ $line"
    elif [ -n "$line" ]; then
      echo "     $line"
    fi
  done
  echo ""
else
  echo "  ⚠  No 'Gates Status' section found in the summary."
  echo "     Gates were not recorded before compaction — treat all as NOT RUN."
  echo ""
fi

# --- 2. Scan web/src for source files without a test counterpart ---
WEB_SRC="${PROJECT_DIR}/web/src"
if [ -d "$WEB_SRC" ]; then
  echo "Untested files scan — web/src:"
  UNTESTED_COUNT=0

  while IFS= read -r file; do
    dir="$(dirname "$file")"
    base_noext="${file%.*}"

    has_test=false

    # Check 1: sibling test with the same base name (utils, hooks)
    if [ -f "${base_noext}.test.ts" ] || [ -f "${base_noext}.test.tsx" ]; then
      has_test=true
    fi

    # Check 2: any *.test.* file in the same directory (covers ComponentName/ComponentName.test.tsx)
    if [ "$has_test" = false ]; then
      if find "$dir" -maxdepth 1 \( -name "*.test.ts" -o -name "*.test.tsx" \) 2>/dev/null | grep -q .; then
        has_test=true
      fi
    fi

    if [ "$has_test" = false ]; then
      echo "  ⚠  ${file#${WEB_SRC}/}"
      UNTESTED_COUNT=$((UNTESTED_COUNT + 1))
    fi
  done < <(find "$WEB_SRC" -type f \( -name "*.ts" -o -name "*.tsx" \) \
    ! -name "*.test.ts" \
    ! -name "*.test.tsx" \
    ! -name "*.d.ts" \
    ! -name "setupTests.ts" \
    ! -name "main.tsx" \
    ! -path "*/__mocks__/*" \
    2>/dev/null | sort)

  if [ "$UNTESTED_COUNT" -eq 0 ]; then
    echo "  ✅ All source files have a test counterpart."
  else
    echo ""
    echo "  → $UNTESTED_COUNT file(s) missing tests. Every component, hook, and utility"
    echo "    must have a unit test file (web/CLAUDE.md — completion gates)."
  fi
  echo ""
fi

# --- 3. Print the full gate checklist as a reminder ---
echo "Completion gates — verify all before marking work done:"

if [ -d "$WEB_SRC" ]; then
  echo ""
  echo "  web/"
  echo "    □ npm run lint       — zero ESLint errors"
  echo "    □ npx tsc --noEmit  — zero TypeScript errors"
  echo "    □ npm test           — all Jest tests pass (including new files)"
  echo "    □ npm run test:e2e   — all Playwright tests pass"
fi

API_DIR="${PROJECT_DIR}/api"
if [ -d "$API_DIR" ]; then
  echo ""
  echo "  api/"
  echo "    □ dotnet build       — zero build errors"
  echo "    □ dotnet test        — all xUnit tests pass"
fi

DB_DIR="${PROJECT_DIR}/database"
if [ -d "$DB_DIR" ]; then
  echo ""
  echo "  database/"
  echo "    □ tSQLt tests pass"
  echo "    □ Every migration has a rollback script and is idempotent"
fi

echo ""
echo "============================================================"
