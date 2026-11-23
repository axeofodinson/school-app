# 32 — Offline Learn and question packs

**Model:** Opus · **Phase:** 3 · **Depends on:** 30, 31 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **32** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- ARCHITECTURE.md §5
- LMS_AUDIT §3.3

## Skills and MCPs to use
Skills: `expo:expo-data-fetching`, `engineering:testing-strategy`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Download a chapter (lessons + approved practice items + images) to use without internet.

## Do
- Pack builder RPC/endpoint returning versioned content for a chapter; client cache (FileSystem native / IndexedDB web) keyed by (id, version); delta refresh by updated_at; storage usage + delete pack UI.
- PWA service worker caching the app shell on web.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/downloads, core cache adapter

## Done when
- [ ] Airplane mode: downloaded chapter fully usable; attempts queue and sync later.
- [ ] Egress per pack measured and recorded in TEST_PLAN.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **32** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
