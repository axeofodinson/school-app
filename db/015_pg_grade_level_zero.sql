-- ============================================================
--  015 — PG becomes grade level 0 (additive, data-only)
--
--  Additive migration. SAFE to run on a live database (no schema changes, no
--  drops) and idempotent (the update is a no-op once PG is already at 0). Run
--  once in the Supabase SQL Editor after 014.
--
--  WHY THIS EXISTS
--  ---------------
--  grade_level is the integer that orders the class list (classes -> ...), read
--  bottom-to-top like the real school. setup.sql seeded PG (Play Group) at -2, a
--  legacy "pre-primary is negative" choice. We standardise PG on grade level 0 —
--  the lowest level, ordered below Grade 1 — so "PG = 0" is a stable, meaningful
--  anchor the app can map to a friendly "PG" label (src/lib/gradeLevels.js).
--
--  0 is safe to use here: grade_level is `not null` with no default and no
--  sentinel meaning anywhere (nothing keys on 0), so nothing collides. Ordering
--  is unchanged in spirit — PG stays the lowest current level. Negative levels
--  remain valid (the create form still allows -5..10) for any other pre-primary
--  variations a school might add later.
--
--  Matched by name so a re-run (or an already-corrected row) is untouched.
-- ============================================================
update public.classes
set grade_level = 0
where name = 'PG' and grade_level <> 0;
