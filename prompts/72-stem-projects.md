# 72 — STEM projects (draft migration 022)

**Model:** Opus · **Phase:** 7 · **Depends on:** 71 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **72** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/022_stem_projects.sql, db/test/022_smoke.sql
- STEMP21_COMPARISON.md §5
- DATABASE_DESIGN.md §6

## Skills and MCPs to use
Skills: `supabase`, `frontend-design`. MCP: Supabase (dev). Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Teachers run hands-on projects with rubrics, teams and evidence, graded into the normal grade book.

## Do
- Finalise 022 (renumber), project catalogue editor (bilingual, grade band, SDG, materials, steps), rubric editor, assign to class, team builder, scoring screen using score_project (whole-team then adjust), evidence upload for students.

## Don't
- No STEMP21 content unless licence_note is filled from a written permission.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- final 022, features/projects

## Done when
- [ ] 022 harness + smoke pass; team score audited per student.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **72** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
