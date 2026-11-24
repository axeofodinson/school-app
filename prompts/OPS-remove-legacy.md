# OPS — Remove legacy (old-app) code or data

**Model:** Opus · **When:** any time an old feature's code or data gets in the way of the rebuild (DECISIONS #22) · **Requires:** a verified backup from [OPS-backup](OPS-backup.md) taken the same day (Actions → Database backup → Run workflow with `keep_label`, e.g. `before-legacy-removal`, so it is never pruned; `docs/backup-restore.md`)

Paste everything below the line into a new Claude Code session, then fill in "What to remove".

---

You are working on the Al-Syed school app remake. Read `CLAUDE.md` (rule 3 and its legacy exception), `DECISIONS.md` #22, `MODULE_STATUS.md` and `db/README.md`.

Hassan has decided that **old features' code and data may be hard-deleted** when they cause trouble or inconvenience. New-system data (anything the new app writes) is still never hard-deleted.

## Do
1. List exactly what will be removed: files/folders in `src/`, old scripts/assets, and DB objects or rows (tables, columns, functions, policies, Storage buckets/objects). For each, show what depends on it (`grep` the new app, other migrations, RLS policies, Edge Functions) and its row count if you can find it.
2. **Code:** delete it in this branch and make sure the new app (`apps/mobile`, `packages/core`) still type-checks, lints and passes tests.
3. **Data/schema:** write a new migration `db/NNN_remove_legacy_<what>.sql`: header says DESTRUCTIVE, lists what goes, and the date of the backup it relies on. Wrap it in a transaction and make it idempotent (`if exists`). Never edit `setup.sql` or old migrations. Dry-run it with the harness (TEST_PLAN DB-1) and prove the new app's smoke tests still pass.
4. Add a `DECISIONS.md` entry (what was removed, why, backup date) and update `db/README.md`, `MODULE_STATUS.md`, `ARCHITECTURE.md`/`DATABASE_DESIGN.md` if they mention it.

## Don't
- Don't remove anything the new app reads or writes, grade history created by the new app (`record_grade` audit after cut-over), or `students`/`enrollments`/`profiles`.
- Don't run the migration on Supabase. Hassan runs it after confirming the backup.

## Done when
- [ ] Dependency list reviewed by Hassan before deleting.
- [ ] New app builds and tests pass; harness dry-run passes.
- [ ] Hassan has the exact run steps, including "confirm today's backup exists first".

## What to remove
[write here, e.g. "old src/ quest UI", "debug_logs table", "old attendance rows before 2026"]
