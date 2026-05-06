#!/usr/bin/env bash
# check-test-coverage.sh — PreToolUse hook for Claude Code
# Blocks git commit if any testable source file in web/src/ is missing
# a corresponding test file.
#
# Testable files: components (.tsx), hooks (.ts), utils (.ts), pages (.tsx)
# Exempt: type definitions, barrel exports (index.ts that only re-export),
#         constants, mocks, test utils, main.tsx, appInsights.ts, global.d.ts

set -euo pipefail

INPUT=$(cat)

# Only run on git commit commands
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')
if ! echo "$COMMAND" | grep -qE '\bgit\s+commit\b'; then
  exit 0
fi

WEB_SRC="web/src"

# Skip if web/src doesn't exist (e.g. running from wrong directory)
if [ ! -d "$WEB_SRC" ]; then
  exit 0
fi

MISSING=()

while IFS= read -r src_file; do
  # Skip files that don't need tests
  basename=$(basename "$src_file")
  dirname_path=$(dirname "$src_file")
  dirname_base=$(basename "$dirname_path")

  # Skip test files themselves
  echo "$src_file" | grep -qE '\.test\.(ts|tsx)$' && continue

  # Skip type declaration files
  echo "$src_file" | grep -qE '\.d\.ts$' && continue

  # Skip mocks and test setup
  echo "$src_file" | grep -qE '(__mocks__|setupTests|test-utils)' && continue

  # Skip main.tsx (entry point — covered by E2E)
  [ "$basename" = "main.tsx" ] && continue

  # Skip appInsights.ts (infra config)
  [ "$basename" = "appInsights.ts" ] && continue

  # Skip type-only files (files in types/ directory or named types.ts)
  echo "$dirname_path" | grep -qE '/types$' && continue
  [ "$basename" = "types.ts" ] && continue

  # Skip constants-only files
  [ "$basename" = "constants.ts" ] && continue

  # Skip barrel exports (index.ts files that are NOT in a component/hook folder)
  # Component folders have an index.tsx alongside a .module.scss or are in hooks/
  if [ "$basename" = "index.ts" ]; then
    # Barrel exports at feature root (e.g. features/chat/index.ts) — skip
    continue
  fi

  # Skip global.d.ts
  [ "$basename" = "global.d.ts" ] && continue

  # This is a testable source file — check for a corresponding test
  ext="${src_file##*.}"
  dir=$(dirname "$src_file")

  # Determine expected test file location
  if [ "$basename" = "index.tsx" ] || [ "$basename" = "index.ts" ]; then
    # Component/hook pattern: ComponentName/index.tsx -> ComponentName/ComponentName.test.tsx
    component_name=$(basename "$dir")
    test_file="$dir/${component_name}.test.tsx"
    test_file_ts="$dir/${component_name}.test.ts"
  else
    # Standalone file: fileName.ts -> fileName.test.ts
    name_without_ext="${basename%.*}"
    test_file="$dir/${name_without_ext}.test.${ext}"
    test_file_alt="$dir/${name_without_ext}.test.tsx"
  fi

  # Check if any form of the test file exists
  found=false
  for candidate in "${test_file:-}" "${test_file_ts:-}" "${test_file_alt:-}"; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      found=true
      break
    fi
  done

  if [ "$found" = false ]; then
    MISSING+=("$src_file")
  fi

done < <(find "$WEB_SRC" -type f \( -name "*.ts" -o -name "*.tsx" \) | sort)

if [ ${#MISSING[@]} -gt 0 ]; then
  # Build the reason message
  MISSING_LIST=""
  for file in "${MISSING[@]}"; do
    MISSING_LIST="${MISSING_LIST}\n  - ${file}"
  done

  cat <<BLOCK
{"decision":"block","reason":"Test coverage check failed. The following ${#MISSING[@]} source file(s) are missing test files:${MISSING_LIST}\n\nEvery component, hook, and utility must have a corresponding test file per web/CLAUDE.md."}
BLOCK
  exit 0
fi

# All testable files have tests
exit 0
