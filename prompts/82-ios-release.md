# 82 — iOS release

**Model:** Opus · **Phase:** 8 · **Depends on:** 13 · **Blocked by:** LMS_AUDIT §7 Q3 (Apple account, pricing)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **82** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- eas.json, docs/environment.md

## Goal
Ship the app on the App Store.

## Do
- iOS config, permissions strings (camera for QR/photo), EAS build/submit, TestFlight checklist; check Apple payment rules for the paid tier.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- iOS build + checklist

## Done when
- [ ] TestFlight build installs and passes the parity smoke checklist.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **82** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
