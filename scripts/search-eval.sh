#!/usr/bin/env bash
# scripts/search-eval.sh
#
# Grades the service search in the newest supabase/migrations/*_service_search*.sql
# against the live catalogue WITHOUT applying it: the functions are loaded as
# session-only pg_temp copies, then supabase/tests/service_search_eval.sql runs
# against them. Nothing is written to the database.
#
#   scripts/search-eval.sh            # full table
#   scripts/search-eval.sh --summary  # pass count + failures only
#
# Needs the Supabase CLI linked to the project (supabase/.temp/project-ref).
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
migration="$(ls "$repo"/supabase/migrations/*_service_search*.sql | tail -1)"
tmp="$(mktemp -t search-eval).sql"
trap 'rm -f "$tmp"' EXIT

{
  # public.search_* -> pg_temp.search_*. Drop grants, comment-only lines, the
  # transaction, and the file's own schema_migrations record: an eval must
  # never mark the migration as applied.
  sed -e '/^INSERT INTO supabase_migrations/,/;$/d' \
      -e 's/CREATE OR REPLACE FUNCTION public\./CREATE FUNCTION pg_temp./' \
      -e 's/public\.search_/pg_temp.search_/g' \
      -e '/^GRANT/d' -e '/^ *--/d' -e '/^CREATE EXTENSION/d' \
      -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' -e '/^DROP FUNCTION/d' "$migration"
  sed -e 's/search_services_ranked(/pg_temp.search_services_ranked(/' \
      "$repo/supabase/tests/service_search_eval.sql"
} > "$tmp"

# Refuse to run if anything could still write outside pg_temp.
if grep -qiE 'schema_migrations|create or replace function public\.|drop function|^(begin|commit);' "$tmp"; then
  echo "search-eval: generated SQL still touches the real schema; aborting" >&2
  exit 1
fi

# The CLI looks for the linked project in the main checkout's supabase/.temp.
cd "${SUPABASE_WORKDIR:-$repo}"
out="$(supabase db query --linked -f "$tmp" -o json 2>/dev/null || supabase db query --linked -f "$tmp")"

if [[ "${1:-}" == "--summary" ]]; then
  node -e '
    const raw = require("fs").readFileSync(0, "utf8");
    const start = raw.indexOf("[");
    const rows = JSON.parse(raw.slice(start, raw.lastIndexOf("]") + 1));
    const fails = rows.filter(r => r.result !== "pass");
    console.log(`${rows.length - fails.length}/${rows.length} pass`);
    for (const f of fails) console.log(`FAIL  ${f.q}  → want "${f.expect}" in top ${f.k}, got ${f.found_at ?? "none"}${f.read_as ? ` (read as "${f.read_as}")` : ""}\n      top: ${f.top5 ?? "(nothing)"}`);
  ' <<<"$out"
else
  echo "$out"
fi
