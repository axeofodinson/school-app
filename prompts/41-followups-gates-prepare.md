# 41 — Follow-ups, gates, relief and the Prepare tab

**Model:** Opus · **Phase:** 4 · **Depends on:** 40 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **41** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §3.5
- ARCHITECTURE.md Mastery row
- DESIGN_SYSTEM.md Prepare wireframe

## Skills and MCPs to use
Skills: `frontend-design`, `design:ux-copy`, `run`. Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
The core loop: Prepare shows follow-ups first, gates hold within a subject, nobody gets trapped.

## Do
(From 40, `db/019`: `record_practice_attempt()` returns bands + follow-ups; `diagnostic_items(topic)`; relief is automatic in the server; `concept_mastery.evidence.needs` explains what's missing. Also swap Home's subject mosaics from tests to concepts (DECISIONS #94).)
- Prepare tab: exam follow-ups first (block other Prepare work), then diagnostic follow-ups by subject, teacher-assigned, revision; subject topic list with gate state.
- Follow-up flow: link back to the Learn section → alternative explanation if rounds ≥ 2 → fresh items → reassess.
- Relief: auto after N rounds or exhausted pool (gate_overrides auto_relief, concept carried_over); teacher relax/restore with reason; works for no-class users.
- Teacher view: students stuck, open follow-ups per concept.

## Don't
- Never force-open follow-ups on app launch.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/prepare, features/followups, teacher stuck-students view

## Done when
- [ ] Scenario tests F-2, F-3 pass on seed data.
- [ ] A student with an exhausted pool is relieved, not stuck.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **41** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
