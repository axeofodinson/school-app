#!/usr/bin/env bash
# Logical backup: pg_dump -> manifest -> tar -> age encrypt.
# Env: DATABASE_URL (secret; never echoed), AGE_RECIPIENT_FILE, OUT_DIR, STAMP
# Output: $OUT_DIR/school-backup-$STAMP.tar.age
set +x
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
RECIP="${AGE_RECIPIENT_FILE:-backup/age-recipient.txt}"
OUT_DIR="${OUT_DIR:-out}"
STAMP="${STAMP:-$(TZ=Asia/Karachi date +%Y%m%d-%H%M)}"

if ! grep -Eq '^age1[a-z0-9]+' "$RECIP"; then
  echo "ERROR: $RECIP has no age public key (still the placeholder?)" >&2
  exit 1
fi

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$OUT_DIR"

# public = app data + schema; auth = logins (students' school-issued accounts);
# storage = bucket/object METADATA only (files themselves are NOT in Postgres).
pg_dump "$DATABASE_URL" --format=custom --compress=9 \
  --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$work/db.dump"

pg_restore --list "$work/db.dump" >/dev/null   # integrity: archive is readable

# Row-count manifest of public tables, used by the restore drill.
psql "$DATABASE_URL" -X -A -t -q -F ' ' -v ON_ERROR_STOP=1 > "$work/manifest.txt" <<'SQL'
select 'public.' || relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text::bigint
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
select 'auth.users',
       (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.users', false, true, '')))[1]::text::bigint;
SQL

{ echo "created_utc $(date -u +%FT%TZ)"; echo "server $(psql "$DATABASE_URL" -X -A -t -c 'show server_version')"; } > "$work/INFO.txt"

tar -C "$work" -cf "$work/bundle.tar" db.dump manifest.txt INFO.txt
age -R "$RECIP" -o "$OUT_DIR/school-backup-$STAMP.tar.age" "$work/bundle.tar"
ls -l "$OUT_DIR"
echo "tables in manifest: $(wc -l < "$work/manifest.txt")"
