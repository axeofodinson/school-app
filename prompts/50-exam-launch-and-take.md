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

## Skills and MCPs to use
Skills: `supabase`, `frontend-design`, `engineering:system-design`. MCP: Supabase (dev). Finish with `/security-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
A teacher creates any assessment (test, quiz, exam, assignment) in ≤3 clicks by drawing random questions from a saved blueprint (DECISIONS #67); students take it with server-owned timing.

## Do
- Blueprint per class/subject (chapters/topics, count, difficulty mix, minutes, marks per question) saved as default in `assessments.blueprint`; last used is pre-filled. Flow: pick class/subject → accept/tweak blueprint → Publish (3 clicks).
- Draw in `packages/core` (pure, seeded, tested): approved exam-scope items only, honour the topic + difficulty mix, prefer items not used in that class recently, report a shortfall instead of silently giving fewer questions. One draw per assessment (same questions for everyone); order + option shuffle per student on the server.
- Works for every type (test, quiz, exam, assignment) and mode (live, offline, printed via 70). After the draw, open prompt 10's builder (`features/assessments`) to review, swap one question for another random one from the same topic, or hand-pick; reuse it, don't fork it.
- Live exams: launch → assessments(mode=live_exam); join via push/in-class list or join code.
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
