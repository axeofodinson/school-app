# 91 — In-app AI drafting (optional)

**Model:** Opus · **Phase:** 9 · **Depends on:** 21, 22 · **Blocked by:** Hassan's budget approval

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **91** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §1.2 5.2 in-app AI row
- CLAUDE.md (no keys in app)

## Goal
Teachers request drafts (questions, explanations, alternatives) inside the app; drafts go to review as usual.

## Do
- Edge Function holding the API key; per-teacher rate limit and monthly cap; output validated by the importer; origin=ai; cost logging.

## Don't
- Never ship an API key in the app.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- supabase/functions/ai-draft, features/ai-draft

## Done when
- [ ] Drafts land in review with a validation report; cap enforced.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **91** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
