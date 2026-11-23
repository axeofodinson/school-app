# 04 — Synthetic data at school scale (656 students)

**Model:** Opus · **Phase:** 0 · **Depends on:** 01 · **Blocked by:** LMS_AUDIT §7 Q7 (dev Supabase project). Without it, seed the local harness DB only.

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **04** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- TEST_PLAN.md §Seed
- DATABASE_DESIGN.md
- db/test/ harness

## Goal
A repeatable, removable fake dataset so every later phase is built and tested at real scale without real student data.

## Do
- `scripts/seed/` (TypeScript, run with node): deterministic UUIDs (v5 from a seed string), idempotent upserts, `is_test_data = true` everywhere it exists.
- Creates: academic year, PG–10 classes (2 sections where sensible), subjects, 656 students + enrollments, ~30 teachers + teacher_assignments, 1 admin; student logins via the existing provisioning approach (local harness: insert into stub auth.users).
- If 017 is applied on the target: 3 subjects × 6 chapters × 4 topics × 4 concepts, ~90 questions per topic with en/ur placeholders (some LaTeX-as-SVG, some diagrams), placeholder lessons, and 3 months of practice attempts / follow-ups / past exams. Otherwise seed only the existing tables and leave the LMS part behind a flag.
- `scripts/seed/remove.ts` deletes all flagged rows child-first.
- Refuse to run unless the target URL is on an allow-list of dev/local targets (never the production project ref in docs/environment.md).

## Don't
- Never point at production.
- Don't use real names; use generated Pakistani-style placeholder names clearly marked TEST.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- seed + remove scripts, README section, TEST_PLAN update with timings and DB size after seed

## Done when
- [ ] Seed runs twice without duplicates; remove leaves zero flagged rows.
- [ ] Row counts match the spec; DB size after seed recorded in TEST_PLAN (budget L-3).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **04** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
