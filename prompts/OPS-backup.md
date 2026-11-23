# OPS — Scheduled database backup (free tier has none)

**Model:** Opus · **When:** before real LMS data goes in (ideally during Phase 0–1) · **Blocked by:** LMS_AUDIT §7 Q5 (where backups go)

Paste everything below the line into a new Claude Code session.

---

You are working on the Al-Syed school app. Read `CLAUDE.md`, `MODULE_STATUS.md` and `LMS_AUDIT.md` §6b (free tier: no automatic backups, project pauses after 7 idle days).

## Goal
A nightly logical backup of the Supabase Postgres database that Hassan can restore, without paying for a plan upgrade.

## Do
- GitHub Actions workflow on a schedule (nightly, off-peak Pakistan time) running `pg_dump` (Postgres client matching the server version) against the project's **session pooler / direct connection string** stored as a GitHub **secret** (Hassan adds it; never commit it).
- Encrypt the dump (e.g. `age` with a public key in the repo; Hassan keeps the private key offline) and store it where Hassan decided (private repo release asset, Google Drive via rclone, or Supabase Storage in a *separate* free project). Keep 14 daily + 8 weekly.
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
