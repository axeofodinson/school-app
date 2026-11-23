# 22 — Teacher review queue: approve / edit / reject

**Model:** Opus · **Phase:** 2 · **Depends on:** 21 · **Blocked by:** —  (decided: each subject's teachers review Urdu, DECISIONS #28)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **22** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DATABASE_DESIGN.md (item_approvals, item_reviews)
- LMS_AUDIT §3 / principle 8

## Goal
A fast review screen so teachers can clear hundreds of AI drafts accurately.

## Do
- Queue filtered by subject/chapter/topic/status; one item at a time with stem, options, answer, explanation, concept, source page, both languages side by side.
- Actions: approve for scopes (learn/practice/exam/worksheet), edit (creates a new version that needs re-approval), request changes, reject/retire; separate 'translation OK' check.
- Keyboard shortcuts on Windows (A approve, E edit, R reject, J/K next/prev, 1–4 scopes); progress counter.
- Review RPC enforcing that teachers approve only concepts they teach (tighten 017's coarse policy).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/review, review RPC migration

## Done when
- [ ] Approving then editing an item drops its approval for the new version.
- [ ] Students can read only practice/worksheet-approved versions (harness test).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **22** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
