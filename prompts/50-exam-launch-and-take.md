# 50 — Teacher surprise exam + student exam screen

**Model:** Opus · **Phase:** 5 · **Depends on:** 22, 41 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **50** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/017 Part 8 (exam RPCs)
- ARCHITECTURE.md §4
- LMS_AUDIT §3.2

## Goal
A teacher launches an exam in ≤3 taps from a saved blueprint; students take it with server-owned timing.

## Do
- Blueprint per class/subject (topics, count, difficulty mix, minutes) saved as default; launch → assessments(mode=live_exam) with approved exam-scope items only; join via push/in-class list or join code.
- Student exam screen: paper from start_exam_session, per-tap save_exam_answer + local copy, timer from deadline − server offset, fullscreen request on web, blur/visibility → log_exam_event, submit → result shown immediately; exam mode forces motion off.
- Add option permutation per student (migration 020) and the pg_cron sweep closing abandoned sessions.

## Don't
- Never claim lockdown in UI copy.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/exams (teacher + student), db/020 part 1

## Done when
- [ ] 40 simulated students (L-1) lose 0 answers; result visible on submit.
- [ ] Re-opening on a second device resumes the same session.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **50** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
