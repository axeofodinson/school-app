# 70 — Worksheets: printable A4 + interactive

**Model:** Opus · **Phase:** 7 · **Depends on:** 22, 31 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **70** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §3.7
- DESIGN_SYSTEM.md print styles

## Goal
Teachers make worksheets from approved items, print sets A/B with a key, or assign them in-app.

## Do
- Builder: topics, item types (MCQ, T/F, fill-blank, short answer), count; sets A/B via seeded shuffle; school header, name/roll lines; separate answer key page.
- Print: web print CSS (A4) and expo-print on native; Urdu renders in print.
- Interactive: same items in the practice renderer; short answers go to a teacher marking queue.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/worksheets

## Done when
- [ ] A/B sets differ, keys match (F-6); A4 output checked from Windows Chrome.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **70** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
