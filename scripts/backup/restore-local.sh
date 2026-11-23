#!/usr/bin/env bash
# Restore drill against a LOCAL throwaway Postgres only (never production).
# Usage: restore-local.sh <backup.tar.age> <age-private-key-file>
# Env:   TARGET_URL  local target DB (default postgresql://postgres@localhost:5432/restore_test)
# Refuses to run if TARGET_URL host isn't localhost/127.0.0.1/socket.
set -euo pipefail
BK="${1:?backup .tar.age}"; KEY="${2:?age private key file}"
TARGET_URL="${TARGET_URL:-postgresql://postgres@localhost:5432/restore_test}"
case "$TARGET_URL" in
  *@localhost[:/]*|*@127.0.0.1[:/]*|*@/*|*host=/*) ;;
  *) echo "REFUSING: target is not local" >&2; exit 2;;
esac
w="$(mktemp -d)"; trap 'rm -rf "$w"' EXIT
age -d -i "$KEY" "$BK" | tar -C "$w" -xf -
cat "$w/INFO.txt"
# Public schema: schema + data. auth/storage: data only (the fresh project already has those tables).
pg_restore -d "$TARGET_URL" --no-owner --no-privileges --exit-on-error --schema=public "$w/db.dump"
pg_restore -d "$TARGET_URL" --no-owner --no-privileges --data-only --disable-triggers --schema=auth "$w/db.dump"
# Compare row counts with the manifest taken at dump time.
psql "$TARGET_URL" -X -A -t -q -F ' ' -v ON_ERROR_STOP=1 <<'SQL' > "$w/after.txt"
select 'public.' || relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text::bigint
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;
select 'auth.users', count(*) from auth.users;
SQL
sort "$w/manifest.txt" > "$w/a"; sort "$w/after.txt" > "$w/b"
if diff "$w/a" "$w/b"; then echo "ROW COUNTS MATCH ($(wc -l < "$w/a") tables)"; else echo "ROW COUNT MISMATCH" >&2; exit 1; fi
