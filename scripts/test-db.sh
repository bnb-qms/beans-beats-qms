#!/usr/bin/env bash
# Run every supabase/tests/*.sql assertion against a disposable, fully
# migrated, Supabase-compatible PostgreSQL database and fail on the first
# assertion. Refuses to point at a shared or production database.
#
# Modes:
#   1. Managed (default): initdb a scratch cluster in a temp dir, apply the
#      bootstrap, every migration in filename order, then the tests, then
#      tear the cluster down. Nothing is written outside the temp dir.
#   2. External: set TEST_DATABASE_URL to a local disposable database. The
#      host must be loopback and TEST_DB_IS_DISPOSABLE=yes must be set, so a
#      production or shared URL is refused by default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
TESTS_DIR="$ROOT/supabase/tests"
BOOTSTRAP="$ROOT/scripts/bootstrap-test-db.sql"

log() { printf '[test-db] %s\n' "$*"; }
die() { printf '[test-db] ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Locate the Postgres client + server binaries.
# ---------------------------------------------------------------------------
find_pg_bin() {
  if command -v psql >/dev/null 2>&1 && command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v psql)"
    return 0
  fi
  local candidate
  for candidate in \
    /opt/homebrew/opt/postgresql@17/bin \
    /opt/homebrew/opt/postgresql@16/bin \
    /opt/homebrew/opt/postgresql@15/bin \
    /opt/homebrew/opt/postgresql@14/bin \
    /usr/local/opt/postgresql@17/bin \
    /usr/local/opt/postgresql@16/bin \
    /usr/local/opt/postgresql@15/bin \
    /usr/lib/postgresql/17/bin \
    /usr/lib/postgresql/16/bin \
    /usr/lib/postgresql/15/bin; do
    if [ -x "$candidate/psql" ] && [ -x "$candidate/initdb" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# Refuse anything that is not an obviously disposable loopback database.
# ---------------------------------------------------------------------------
is_disposable_url() {
  local url="$1" host
  host="$(printf '%s' "$url" | sed -nE 's#^[a-zA-Z]+://[^@/]*@?([^:/]+).*#\1#p')"
  [ -n "$host" ] || return 0 # DSN without a parseable host (local socket) is fine.
  case "$host" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

PSQL_BIN="$(find_pg_bin)" || die "PostgreSQL client/server binaries (psql, initdb) not found on PATH or a known Homebrew/lib path"
log "Using Postgres from $PSQL_BIN"

TMP_DIR=""
ERR_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bb-test-db-err.XXXXXX")"
MANAGED=0
PSQL_ARGS=()

cleanup() {
  if [ "$MANAGED" -eq 1 ]; then
    "$PSQL_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
    log "Scratch cluster stopped and removed"
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
  rm -rf "$ERR_DIR"
}
trap cleanup EXIT

start_managed() {
  local port tries=0
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bb-test-db.XXXXXX")"
  [ -n "$TMP_DIR" ] || die "Could not create a temp directory"
  log "Creating scratch cluster in $TMP_DIR"
  "$PSQL_BIN/initdb" -D "$TMP_DIR/data" -U "$USER" -A trust --no-sync -E UTF8 \
    >/dev/null 2>&1 || die "initdb failed (needs a non-root user)"
  port=$((20000 + RANDOM % 20000))
  # Keep trying until the scratch server binds (rare port collision).
  until "$PSQL_BIN/pg_ctl" -D "$TMP_DIR/data" \
    -o "-p $port -k $TMP_DIR -c listen_addresses=''" \
    -l "$TMP_DIR/log" -w start >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 5 ]; then
      cat "$TMP_DIR/log" >&2 || true
      die "Could not start scratch cluster"
    fi
    port=$((port + 7))
  done
  PSQL_ARGS=(-h "$TMP_DIR" -p "$port" -U "$USER")
  MANAGED=1
  # Create the test database before switching to it.
  "$PSQL_BIN/psql" "${PSQL_ARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -q \
    -c "create database beans_beats_test"
  PSQL_ARGS+=(-d beans_beats_test)
  log "Scratch cluster ready on port $port"
}

use_external() {
  local url="$1"
  is_disposable_url "$url" || die "Refusing non-loopback host in TEST_DATABASE_URL; shared or production databases are not allowed"
  [ "${TEST_DB_IS_DISPOSABLE:-}" = "yes" ] || die "Set TEST_DB_IS_DISPOSABLE=yes to confirm TEST_DATABASE_URL points at a disposable database"
  PSQL_ARGS=( "$url" )
  log "Using external disposable database"
}

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  use_external "$TEST_DATABASE_URL"
else
  start_managed
fi

# Run one SQL file with fail-fast assertions.
psql_file() {
  "$PSQL_BIN/psql" "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q -f "$1"
}

# ---------------------------------------------------------------------------
# Bootstrap (roles + auth schema), migrations in filename order, then tests.
# ---------------------------------------------------------------------------
[ -f "$BOOTSTRAP" ] || die "Missing $BOOTSTRAP"
psql_file "$BOOTSTRAP" || die "Bootstrap failed"
log "Bootstrap applied (roles + auth schema)"

shopt -s nullglob
migrations=( "$MIGRATIONS_DIR"/*.sql )
[ "${#migrations[@]}" -gt 0 ] || die "No migrations found in $MIGRATIONS_DIR"
for m in "${migrations[@]}"; do
  log "Migration: $(basename "$m")"
  psql_file "$m" || die "Migration failed: $(basename "$m")"
done
log "Applied ${#migrations[@]} migrations"

tests=( "$TESTS_DIR"/*.sql )
# Never let the job pass silently when the SQL assertions are absent.
[ "${#tests[@]}" -gt 0 ] || die "No SQL tests found in $TESTS_DIR; refusing to skip database assertions"

for t in "${tests[@]}"; do
  base="$(basename "$t")"
  if psql_file "$t" >/dev/null 2>"$ERR_DIR/test.err"; then
    log "PASS  $base"
  else
    log "FAIL  $base"
    cat "$ERR_DIR/test.err" >&2
    exit 1
  fi
done

log "All ${#tests[@]} SQL test files passed"
