# OPS — Scheduled database backup (free tier has none)

**Model:** Opus · **When:** before real LMS data goes in (ideally during Phase 0–1) · **Blocked by:** — (decided: encrypted dumps in a private GitHub repo, DECISIONS #29)

Paste everything below the line into a new Claude Code session.

---

You are working on the Al-Syed school app. Read `CLAUDE.md`, `MODULE_STATUS.md` and `LMS_AUDIT.md` §6b (free tier: no automatic backups, project pauses after 7 idle days).

## Goal
A nightly logical backup of the Supabase Postgres database that Hassan can restore, without paying for a plan upgrade.

## Do
- GitHub Actions workflow on a schedule (nightly, off-peak Pakistan time) running `pg_dump` (Postgres client matching the server version) against the project's **session pooler / direct connection string** stored as a GitHub **secret** (Hassan adds it; never commit it).
- Encrypt the dump with `age` (public key committed; Hassan keeps the private key offline, e.g. printed + on a USB stick) and upload it as a **release asset in a separate private GitHub repo** (e.g. `school-app-backups`), using a fine-grained token stored as a secret. Keep 14 daily + 8 weekly releases; prune older ones. Asset size stays well under GitHub's 2 GB release-asset limit.
- A weekly keep-alive request so the project doesn't pause during holidays (if Hassan wants that).
- `docs/backup-restore.md`: how to restore into a fresh project, step by step, plus a quarterly restore drill.

## Don't
- Don't put any connection string, password or key in the repo, workflow file or logs.
- Don't run restores against production.

## Done when
- [ ] A manual workflow run produces an encrypted dump in the chosen location.
- [ ] A restore into the local harness Postgres (TEST_PLAN DB-1) succeeds and row counts match.

## Finish
Follow the session protocol in `CLAUDE.md`; tick **OPS-backup** in `prompts/README.md`.
