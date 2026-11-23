# 80 — Dashboards: student, teacher, admin

**Model:** Opus · **Phase:** 8 · **Depends on:** 42, 51 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **80** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §5.12 metrics, principle 10
- DATABASE_DESIGN.md (021 rollups)

## Skills and MCPs to use
Skills: `dataviz`, `frontend-design`, `supabase-postgres-best-practices`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Show learning, not activity: mastery bands, weak concepts, retention, students needing help.

## Do
- Nightly rollups (migration 021).
- Student: concepts mastered/weak, upcoming exams/homework, retention checks.
- Teacher: class weak concepts, exam results, item analysis, stuck students.
- Admin: school-wide by class/subject.

## Don't
- No false precision; no streak leaderboard.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- db/021, features/dashboards

## Done when
- [ ] Teacher dashboard p95 < 1 s on seed data (S-3).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **80** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
