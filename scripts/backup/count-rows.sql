-- Exact row count of every table that a backup holds data for.
-- psql variable :schemas = '{public,...}' (app schemas); :extra = '{auth.users,...}'.
-- Output: schema<TAB>table<TAB>rows, sorted. Used by dump.sh and restore.sh,
-- so the two sides count the same tables the same way.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'
select format('select %L, %L, count(*) from %I.%I', n.nspname, c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (n.nspname = any (:'schemas'::text[])
       or n.nspname || '.' || c.relname = any (:'extra'::text[]))
order by n.nspname, c.relname
\gexec
