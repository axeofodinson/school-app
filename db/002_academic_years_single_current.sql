-- ============================================================
--  002 — Enforce "at most one CURRENT academic year"
--
--  Additive migration. SAFE to run on a live database (no drops, no data
--  loss) and idempotent (safe to run more than once).
--
--  setup.sql creates academic_years with an `is_current` flag but nothing
--  stops two rows being current at the same time. Since a student's class
--  and everything scoped to time hangs off "the current year", that
--  invariant must hold in the DB — not just in app code. This adds:
--
--    * a BEFORE trigger that clears is_current on every OTHER row whenever a
--      row is set current, so promoting a new current year automatically
--      demotes the old one in the same statement; and
--    * a partial unique index as a hard backstop, so the invariant survives
--      even a write that bypasses the trigger.
--
--  Run it once in the Supabase SQL Editor after setup.sql.
-- ============================================================

-- If existing data somehow already has multiple currents, keep only the most
-- recent (latest start date, then label) so the unique index below can build.
with ranked as (
  select id,
         row_number() over (order by starts_on desc nulls last, label desc) as rn
  from public.academic_years
  where is_current
)
update public.academic_years a
set    is_current = false
from   ranked
where  a.id = ranked.id and ranked.rn > 1;

-- Demote every other current row when a row becomes current.
-- The inner UPDATE sets is_current = false, so the WHEN (new.is_current)
-- guard is false for it and the trigger does not recurse.
create or replace function public.enforce_single_current_year()
returns trigger language plpgsql as $$
begin
  update public.academic_years
    set is_current = false
    where id <> new.id and is_current;
  return new;
end $$;

drop trigger if exists t_academic_years_single_current on public.academic_years;
create trigger t_academic_years_single_current
  before insert or update of is_current on public.academic_years
  for each row when (new.is_current)
  execute function public.enforce_single_current_year();

-- Hard backstop: at most one row may have is_current = true.
create unique index if not exists ux_academic_years_one_current
  on public.academic_years (is_current)
  where is_current;
