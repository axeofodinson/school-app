#!/usr/bin/env bash
# Logical backup of the school database (OPS-backup, docs/backup-restore.md).
#
#   DATABASE_URL=postgresql://... scripts/backup/dump.sh <out-dir>
#
# Writes into <out-dir>:
#   app.dump        pg_dump custom format: every app schema (public, ...) in full
#   supabase.dump   auth.users, auth.identities, storage.buckets, storage.objects
#                   (their rows, and our triggers/policies on them)
#   counts.tsv      exact row count per table (what restore.sh checks against)
#   extensions.tsv  installed extensions + schema (restore re-creates them)
#   publications.tsv  Realtime membership of app tables (pg_dump --schema skips it)
#   meta.txt        when, server + pg_dump versions, schemas
# Both dumps and the counts read ONE exported snapshot, so they agree exactly.
# (pg_dump can't take both in one run: with --table, --schema is ignored.)
#
# Never prints the connection string. Needs psql + pg_dump of the server's
# major version (PG_BIN=/usr/lib/postgresql/<major>/bin to pick one).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (never commit it)}"
out=${1:?usage: dump.sh <out-dir>}
here=$(cd "$(dirname "$0")" && pwd)
bin=${PG_BIN:+$PG_BIN/}
mkdir -p "$out"

# Supabase-managed tables whose rows we must keep: logins (bcrypt PIN/password
# hashes, so the dump is sensitive: it is only ever stored encrypted) and the
# storage bucket config + file index. Uploaded file *contents* live in Storage,
# not in Postgres, and are NOT in this dump.
SUPABASE_TABLES=(auth.users auth.identities storage.buckets storage.objects)

q() { "${bin}psql" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

managed=$(grep -v '^#' "$here/managed-schemas.txt" | grep -v '^$' | sed "s/.*/'&'/" | paste -sd, -)
mapfile -t schemas < <(q -c "select nspname from pg_namespace
  where nspname !~ '^pg_' and nspname not in ($managed) order by 1")
mapfile -t extra < <(q -c "select n.nspname || '.' || c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname || '.' || c.relname in ($(printf "'%s'," "${SUPABASE_TABLES[@]}" | sed 's/,$//'))
  order by 1")
[ ${#schemas[@]} -gt 0 ] || { echo "no app schemas found" >&2; exit 1; }

server_version=$(q -c "show server_version")
server_major=$(q -c "select current_setting('server_version_num')::int / 10000")
dump_major=$("${bin}pg_dump" --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)*.*/\1/')
if [ "$dump_major" -lt "$server_major" ]; then
  echo "pg_dump $dump_major is older than server $server_major: install postgresql-client-$server_major" >&2
  exit 1
fi

schemas_arr="{$(IFS=,; echo "${schemas[*]}")}"
extra_arr="{$(IFS=,; echo "${extra[*]:-}")}"

# Hold one snapshot open for the counts and both dumps. Needs a session-level
# connection (direct or session pooler :5432), not the transaction pooler.
coproc SNAP { "${bin}psql" "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1; }
echo "begin isolation level repeatable read read only; select pg_export_snapshot();" >&"${SNAP[1]}"
IFS= read -r -t 60 snap <&"${SNAP[0]}" || { echo "could not export a snapshot" >&2; exit 1; }
in_snap=(-c "begin isolation level repeatable read read only" -c "set transaction snapshot '$snap'")

q "${in_snap[@]}" -v schemas="$schemas_arr" -v extra="$extra_arr" -f "$here/count-rows.sql" -c commit > "$out/counts.tsv"
q -F $'\t' -c "select e.extname, n.nspname from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' order by 1" > "$out/extensions.tsv"

q -F $'\t' -c "select pubname, schemaname, tablename from pg_publication_tables
  where schemaname = any ('$schemas_arr'::text[]) order by 1, 2, 3" > "$out/publications.tsv"

common=(--format=custom --no-subscriptions --snapshot="$snap")
app_args=("${common[@]}" --file="$out/app.dump")
for s in "${schemas[@]}"; do app_args+=(--schema="$s"); done
"${bin}pg_dump" "${app_args[@]}" "$DATABASE_URL"
if [ ${#extra[@]} -gt 0 ]; then
  supa_args=("${common[@]}" --file="$out/supabase.dump")
  for t in "${extra[@]}"; do supa_args+=(--table="$t"); done
  "${bin}pg_dump" "${supa_args[@]}" "$DATABASE_URL"
fi
snap_in=${SNAP[1]}
echo "commit;" >&"$snap_in"; exec {snap_in}>&-; wait "$SNAP_PID" 2>/dev/null || true

# The archives must be readable and hold every counted table, or the backup is worthless.
tables=$(for f in "$out"/*.dump; do "${bin}pg_restore" --list "$f"; done | grep -c ' TABLE DATA ' || true)
counted=$(wc -l < "$out/counts.tsv")
if [ "$tables" -ne "$counted" ]; then
  echo "dump holds data for $tables tables but $counted were counted" >&2; exit 1
fi

{
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "server_version=$server_version"
  echo "pg_dump=$("${bin}pg_dump" --version)"
  echo "schemas=${schemas[*]}"
  echo "supabase_tables=${extra[*]:-}"
  echo "tables_with_data=$tables"
  echo "total_rows=$(awk -F'\t' '{s+=$3} END {print s+0}' "$out/counts.tsv")"
  echo "source_commit=${GITHUB_SHA:-local}"
} > "$out/meta.txt"
cat "$out/meta.txt"
