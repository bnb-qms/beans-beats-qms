#!/usr/bin/env bash
# Complete local gate: the same checks CI runs, in order, fail-fast.
set -euo pipefail

# Run each gate and stop at the first failure, keeping the original exit code.
run_gate() {
  local name="$1"; shift
  printf '[test-all] %s\n' "$name"
  if ! "$@"; then
    printf '[test-all] FAILED: %s\n' "$name" >&2
    exit 1
  fi
}

run_gate "npm run lint"          npm run lint
run_gate "npm run format:check"  npm run format:check
run_gate "npm run typecheck"     npm run typecheck
run_gate "npm test"              npm test
run_gate "npm run test:db"       npm run test:db
run_gate "npm run build"         npm run build

printf '[test-all] All gates passed\n'
