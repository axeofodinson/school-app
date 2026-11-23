# 62 — Scale and free-tier tests

**Model:** Opus · **Phase:** 6 · **Depends on:** 04, 50 · **Blocked by:** Dev Supabase project created by Hassan (DECISIONS #27)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **62** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- TEST_PLAN L-1…L-3, S-3
- LMS_AUDIT §6b

## Goal
Prove the system holds at school scale within the free tier.

## Do
- Node load script with real JWTs for 40 and 200 concurrent exam takers; EXPLAIN ANALYZE of teacher views on seed data; DB size projection; egress estimate per student per week.

## Don't
- Never against production.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- scripts/load/, results table in TEST_PLAN, index/RLS fixes as a migration if needed

## Done when
- [ ] p95 targets in TEST_PLAN met or a fix plan recorded.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **62** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
