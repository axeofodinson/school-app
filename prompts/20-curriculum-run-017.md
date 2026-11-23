# 20 — Curriculum: apply 017 and build topic/concept editors

**Model:** Opus · **Phase:** 2 · **Depends on:** 13 · **Blocked by:** Hassan runs 017 on Supabase

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **20** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/017_lms_foundation.sql (draft)
- DATABASE_DESIGN.md §1–4
- TEST_PLAN DB-1/DB-2

## Skills and MCPs to use
Skills: `supabase`, `supabase-postgres-best-practices`. MCP: Supabase (dev project: apply and test there first). Finish with `/security-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Finalise and apply the LMS foundation migration, then let staff manage curriculum versions, topics, concepts and prerequisites.

## Do
- Re-review 017 against anything that changed since it was drafted; renumber if needed; remove the DRAFT header only when Hassan is about to run it; write the RLS matrix tests (DB-2).
- Editors: curricula (PTB edition), chapter → topics → concepts (bilingual titles, order, retire not delete), prerequisite picker, diagnostic size per topic.
- Backfill helper: attach existing chapters to a PTB curriculum row.

## Don't
- Don't build the importer here.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- final 017, db/README update, features/curriculum

## Done when
- [ ] Harness + RLS matrix pass.
- [ ] A teacher can edit topics only in chapters they teach.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **20** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
