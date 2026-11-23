# Backup & restore (free-tier Supabase)

The free plan has **no automatic backups** and **pauses after 7 idle days**.
This repo covers both with GitHub Actions:

| Workflow | When | What |
| --- | --- | --- |
| `.github/workflows/nightly-backup.yml` | 02:30 Pakistan time, daily | `pg_dump` → `age`-encrypted → release in the private backups repo. Keeps 14 daily + 8 weekly (Sundays). |
| `.github/workflows/keep-alive.yml` | Thursday 03:00 PKT | One REST read so the project never idles 7 days. Delete the file if not wanted. |

**What is backed up:** schemas `public` (all school data), `auth` (login accounts) and
`storage` (bucket/file *metadata*). **Not backed up:** the actual files in Storage
(e.g. the `assessment-files` bucket), Edge Function code (it's in git under
`supabase/functions`), Realtime publication/cron/project settings (re-created by
`db/0xx` migrations / dashboard), and API keys/secrets.

## One-time setup (Hassan)

1. **Make the age key (offline machine).** `age-keygen -o school-backup.key`.
   Print `school-backup.key` and copy it to a USB stick; keep both somewhere safe
   (two places). Never put it in GitHub, email or cloud drives. **Lose it and every
   backup is unreadable.** Put the `age1…` *public* key from the output into
   `backup/age-recipient.txt` (replace the placeholder comments) and commit.
2. **Create a private repo** `school-app-backups` (empty, private).
3. **Fine-grained token**: GitHub → Settings → Developer settings → Fine-grained
   tokens → only repo `school-app-backups`, permission *Contents: Read and write*,
   expiry 1 year (calendar a reminder to rotate).
4. **DB connection string**: Supabase Dashboard → *Connect* → **Session pooler**
   (GitHub runners are IPv4-only; the free direct connection is IPv6-only). Use the
   `postgres` user's URI with the real password filled in.
5. In the **app repo** → Settings → Secrets and variables → Actions:
   - Secrets: `SUPABASE_DB_URL` (step 4), `BACKUP_REPO_TOKEN` (step 3),
     and for keep-alive `SUPABASE_URL` + `SUPABASE_ANON_KEY` (the public anon key).
   - Variables (optional): `BACKUP_REPO` (`owner/school-app-backups`, default is
     `<owner>/school-app-backups`), `PG_MAJOR` (default `17`; must be ≥ the server's
     major version — check Dashboard → Settings → Infrastructure).
6. Run **Actions → Nightly DB backup → Run workflow** once. A release `daily-YYYY-MM-DD`
   with one `school-backup-*.tar.age` asset must appear in the backups repo.

Secrets are only passed as env vars and masked; nothing sensitive is committed or printed.
The dump is encrypted before it leaves the runner.

## Restore into a fresh Supabase project

Do this on a laptop with `postgresql-client` (≥ server major), `age`, `tar`.
**Never against the production project.**

1. Download the newest `school-backup-*.tar.age` from the backups repo's Releases.
2. Decrypt and unpack:
   ```bash
   age -d -i school-backup.key school-backup-XXXX.tar.age | tar -xf -
   # gives: db.dump  manifest.txt  INFO.txt
   ```
3. Create a new Supabase project. Get its **session pooler** URI and export it:
   ```bash
   export TARGET_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres'
   ```
4. Restore app schema + data (the fresh project's `public` is empty):
   ```bash
   pg_restore -d "$TARGET_URL" --no-owner --no-privileges --exit-on-error --schema=public db.dump
   ```
5. Restore logins (the project already has the `auth` tables, so data only):
   ```bash
   pg_restore -d "$TARGET_URL" --no-owner --no-privileges --data-only --disable-triggers --schema=auth db.dump
   ```
6. Re-apply things that live outside `public`: any Realtime publication / storage
   bucket/policy statements from the numbered migrations (`db/012_*`, `db/014_*`),
   then redeploy Edge Functions (`supabase functions deploy`) and set their secrets.
7. Re-upload Storage files from their original source (they aren't in the dump).
8. Point the app at the new project (`.env` URL + anon key; EAS env vars), rebuild.
9. Compare counts with `manifest.txt`:
   ```bash
   psql "$TARGET_URL" -Atc "select count(*) from public.profiles"   # etc., vs manifest.txt
   ```

## Quarterly restore drill (calendar: Jan/Apr/Jul/Oct, 1st week)

Prove the backups work **without touching production**:

1. Fetch the latest release; decrypt with the offline key (proves the key still works).
2. Start a local throwaway Postgres (version = server's) and give it the Supabase stub:
   ```bash
   createdb restore_test && psql -d restore_test -f scripts/backup/supabase-stub.sql
   ```
3. Run the drill script, which restores and diffs row counts against the manifest:
   ```bash
   TARGET_URL=postgresql://postgres:pw@localhost:5432/restore_test \
     scripts/backup/restore-local.sh school-backup-XXXX.tar.age school-backup.key
   ```
   It refuses non-local targets. Expect `ROW COUNTS MATCH`.
4. Log the date, backup used, and result below.

| Date | Backup | Result | By |
| --- | --- | --- | --- |
| _(none yet)_ | | | |

Also check each quarter: latest release is < 2 days old, the token hasn't expired,
and Actions hasn't auto-disabled the schedule (GitHub disables scheduled workflows
after 60 days of repo inactivity — a push or manual run re-enables them).
