#!/usr/bin/env bash
# Restore a backup into a FRESH, EMPTY Supabase project (or the local harness).
#
#   TARGET_DB_URL=postgresql://... scripts/backup/restore.sh <backup.tar.age | backup.tar | dir> [age-identity-file]
#
# Steps (docs/backup-restore.md explains them):
#   0. refuse unless the target is empty (no app tables, no auth users):
#      this is what stops a restore over production
#   1. extensions, then app schemas: types, tables, functions (pre-data)
#   2. all rows (app + auth/storage) with triggers off (session_replication_role)
#   3. indexes, constraints, triggers, RLS policies (post-data)
#   4. our triggers/policies on auth.users, auth.identities, storage.objects
#      (skipped where the target already has one of that name)
#   5. row counts compared with counts.tsv from the dump; exit 1 on any mismatch
# Each step is one transaction and stops at the first error.
set -euo pipefail

: "${TARGET_DB_URL:?set TARGET_DB_URL to the NEW project (never production)}"
src=${1:?usage: restore.sh <backup> [identity]}
identity=${2:-}
here=$(cd "$(dirname "$0")" && pwd)
bin=${PG_BIN:+$PG_BIN/}
tmp=$(mktemp -d)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
trap 'rm -rf "$tmp"' EXIT

q() { "${bin}psql" "$TARGET_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }
step() { echo "== $*"; }

# ---- unpack ---------------------------------------------------------------
case "$src" in
  *.age)
    [ -n "$identity" ] || { echo "encrypted backup: pass the private key file as 2nd argument" >&2; exit 1; }
    age --decrypt --identity "$identity" --output "$tmp/b.tar" "$src"
    tar -C "$tmp" -xf "$tmp/b.tar"; rm -f "$tmp/b.tar" ;;
  *.tar) tar -C "$tmp" -xf "$src" ;;
  *) [ -d "$src" ] || { echo "not a backup: $src" >&2; exit 1; }; cp -r "$src" "$tmp/dir" ;;
esac
dir=$(dirname "$(find "$tmp" -name app.dump | head -1)")
[ -f "$dir/app.dump" ] || { echo "no app.dump inside $src" >&2; exit 1; }
supa="$dir/supabase.dump"
sed 's/^/   /' "$dir/meta.txt"
schemas=$(sed -n 's/^schemas=//p' "$dir/meta.txt")
extra=$(sed -n 's/^supabase_tables=//p' "$dir/meta.txt")

# ---- 0. guard ---------------------------------------------------------------
step "0. checking the target is empty"
in_list=$(echo "$schemas" | tr ' ' '\n' | sed "s/.*/'&'/" | paste -sd, -)
existing=$(q -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ($in_list)")
users=$(q -c "select case when to_regclass('auth.users') is null then 0 else (select count(*) from auth.users) end")
if [ "$existing" != 0 ] || [ "$users" != 0 ]; then
  echo "REFUSED: target already has $existing app tables and $users auth users." >&2
  echo "Restore only into a brand-new, empty project. Never into production." >&2
  exit 2
fi

# ---- plan: split the archive's table of contents ---------------------------
# TOC line: "<id>; <catalog oid> <oid> <TYPE...> <schema> <name> <owner>"
# app.dump: everything except DEFAULT ACL and the public schema itself (a fresh
# project already has both, owned by Supabase).
# supabase.dump: only the rows (TABLE DATA) and our TRIGGER/POLICY entries;
# the tables themselves already exist in every Supabase project.
"${bin}pg_restore" --list "$dir/app.dump" | grep -v '^;' \
  | grep -Ev ' DEFAULT ACL | SCHEMA - public | COMMENT - SCHEMA public ' > "$tmp/app.list"
: > "$tmp/supa.toc"; [ -f "$supa" ] && "${bin}pg_restore" --list "$supa" > "$tmp/supa.toc"
grep -E '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA ' "$tmp/supa.toc" > "$tmp/supa-data.list" || true
: > "$tmp/supa-post.list"
while IFS= read -r line; do
  read -r _ _ _ type schema table name _ <<< "$line"
  if [ "$type" = TRIGGER ]; then
    has=$(q -c "select count(*) from pg_trigger where not tgisinternal and tgname = '$name'
      and tgrelid = to_regclass('$schema.$table')")
  else
    has=$(q -c "select count(*) from pg_policies where schemaname = '$schema'
      and tablename = '$table' and policyname = '$name'")
  fi
  if [ "$has" = 0 ]; then echo "$line" >> "$tmp/supa-post.list"; else echo "   skip existing $type $schema.$table $name"; fi
done < <(grep -E '^[0-9]+; [0-9]+ [0-9]+ (TRIGGER|POLICY) ' "$tmp/supa.toc" || true)

restore() { # <archive> <list> [extra pg_restore args...]
  local archive=$1 list=$2; shift 2
  "${bin}pg_restore" --no-owner --single-transaction --exit-on-error \
    --use-list="$list" --dbname="$TARGET_DB_URL" "$@" "$archive"
}

# ---- 1. extensions + schema -------------------------------------------------
step "1. extensions + tables, types, functions"
while IFS=$'\t' read -r ext sch; do
  [ -n "$ext" ] || continue
  q -c "create schema if not exists \"$sch\"; create extension if not exists \"$ext\" with schema \"$sch\"" \
    || echo "   WARN: could not create extension $ext (enable it in the dashboard, then re-run)"
done < "$dir/extensions.tsv"
restore "$dir/app.dump" "$tmp/app.list" --section=pre-data

# ---- 2. rows ----------------------------------------------------------------
step "2. rows (triggers off while loading)"
# replica = no triggers, no FK checks while loading: auth.users rows must not
# fire the sign-up trigger (it would create duplicate profiles).
export PGOPTIONS="${PGOPTIONS:-} -c session_replication_role=replica"
if [ -s "$tmp/supa-data.list" ]; then restore "$supa" "$tmp/supa-data.list"; fi
restore "$dir/app.dump" "$tmp/app.list" --section=data
export PGOPTIONS="${PGOPTIONS% -c session_replication_role=replica}"

# ---- 3. indexes, constraints, triggers, policies ----------------------------
step "3. indexes, constraints, triggers, RLS policies"
restore "$dir/app.dump" "$tmp/app.list" --section=post-data

# Realtime: pg_dump --schema doesn't carry publication membership (012 adds
# public.messages to supabase_realtime), so dump.sh lists it separately.
if [ -s "$dir/publications.tsv" ]; then
  while IFS=$'\t' read -r pub sch tbl; do
    q -c "do \$\$ begin
      if not exists (select 1 from pg_publication where pubname = '$pub') then
        raise warning 'publication % missing: add %.% to Realtime in the dashboard', '$pub', '$sch', '$tbl';
      elsif not exists (select 1 from pg_publication_tables where pubname = '$pub' and schemaname = '$sch' and tablename = '$tbl') then
        execute format('alter publication %I add table %I.%I', '$pub', '$sch', '$tbl');
      end if; end \$\$"
    echo "   publication $pub: $sch.$tbl"
  done < "$dir/publications.tsv"
fi

# ---- 4. our hooks on auth/storage tables ------------------------------------
step "4. triggers/policies on auth + storage tables"
if [ -s "$tmp/supa-post.list" ]; then restore "$supa" "$tmp/supa-post.list"; else echo "   none"; fi
q -c "analyze" || true

# ---- 5. verify ----------------------------------------------------------------
step "5. row counts vs the backup"
q -v schemas="{${schemas// /,}}" -v extra="{${extra// /,}}" -f "$here/count-rows.sql" > "$tmp/after.tsv"
if diff <(sort "$dir/counts.tsv") <(sort "$tmp/after.tsv") > "$tmp/diff"; then
  echo "   OK: $(wc -l < "$tmp/after.tsv") tables, $(awk -F'\t' '{s+=$3} END {print s+0}' "$tmp/after.tsv") rows, all counts match"
else
  echo "MISMATCH (< backup, > restored):" >&2; cat "$tmp/diff" >&2; exit 3
fi
