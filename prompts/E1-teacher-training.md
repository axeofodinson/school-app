# E1 — Extension: teacher training track

**Model:** Opus · **Phase:** 10 · **Depends on:** 30, 31, 41 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **E1** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §10 E1

## Skills and MCPs to use
Skills: `frontend-design`, `design:ux-copy`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Teachers learn to run the LMS inside the app and earn a 'ready to run exams' badge.

## Do
- learning_content.audience (migration 023 part), staff-only 'LMS training' curriculum subtree, 6–10 short bilingual lessons with quick checks, badge on mastery, admin completion view.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- 023 part E1, training content import file, admin view

## Done when
- [ ] A teacher completes the track and the badge shows; students can't see teacher content (RLS).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **E1** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
