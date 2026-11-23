# 14 — Rebuild: attendance

**Model:** Opus · **Phase:** 1b · **Depends on:** 13 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **14** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- old src/screens/console/AttendanceScreen.js, src/screens/student/StudentAttendanceScreen.js (behaviour only)
- db/setup.sql attendance table
- DECISIONS.md #22 (legacy may be removed)

## Skills and MCPs to use
Skills: `frontend-design`, `run`. Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Fast daily attendance for teachers and a clear attendance view for students, rebuilt properly.

## Do
- Teacher: class roster for today, everyone present by default, tap to mark absent/late/leave, works offline (sync queue), edit past days with audit reason.
- Student: monthly calendar + percentage; admin: class/date summaries.
- Decide per DECISIONS #22 whether old attendance rows are kept or removed; if removal is wanted, hand it to OPS-remove-legacy instead of deleting here.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/attendance (+ migration if an audit column is needed)

## Done when
- [ ] Marking 40 students takes < 30 s on a Chromebook; offline marking syncs once.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **14** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
