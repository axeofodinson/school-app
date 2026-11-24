# Database backups and restore

The Supabase free tier keeps **no backups** and **pauses** a project after 7 idle
days (LMS_AUDIT §6b). So every night GitHub Actions takes a full logical copy of
the production database, encrypts it, and stores it in a **private** GitHub repo.
Cost: 0 (Actions minutes on a ~1 MB job; releases are free).

| | |
|---|---|
| When | every night 03:37 Pakistan time (22:37 UTC), plus any time by hand |
| What | everything in `public` (all school + LMS tables, functions, RLS policies, triggers, grants), the logins (`auth.users`, `auth.identities`, incl. PIN/password hashes), storage bucket settings + file index (`storage.buckets`, `storage.objects`), our triggers/policies on those, Realtime membership |
| Not included | **uploaded file contents** (assessment files, project evidence live in Supabase Storage, not Postgres), Auth dashboard settings, Edge Functions and their secrets, API keys. See "after a restore" |
| Where | release assets in `school-app-backups` (private), one release per backup |
| Kept | newest backup of each of the last **14 days** + of each of the last **8 weeks**; anything tagged `keep-…` forever |
| Encrypted | with [age](https://age-encryption.org) to the public key(s) in `scripts/backup/age-recipients.txt`; only the **private key** (offline, with Hassan) can open it |
| Files | `.github/workflows/db-backup.yml`, `.github/workflows/supabase-keepalive.yml`, `scripts/backup/` |

A backup file is `school-db-YYYYMMDD-HHMMZ.tar.age`. Inside (after decrypting):
`app.dump` + `supabase.dump` (pg_dump custom format, taken from one snapshot),
`counts.tsv` (rows per table), `extensions.tsv`, `publications.tsv`, `meta.txt`.

---

## Setup (Hassan, once, ~30 minutes)

### 1. Make the encryption key (on your PC, offline)
1. Download age for Windows: github.com/FiloSottile/age/releases →
   `age-v1.x.x-windows-amd64.zip`. Unzip to e.g. `C:\age\`.
2. In PowerShell: `C:\age\age-keygen.exe -o school-backup-key.txt`
   It prints `Public key: age1…`.
3. **Keep the private key safe and offline:** print `school-backup-key.txt`
   (the `AGE-SECRET-KEY-1…` line), copy the file to **two** USB sticks kept in
   different places, then delete it from the PC. Never put it in GitHub, a
   secret, email, Drive or a chat. **Lose it and every backup is unreadable.**
4. Put the **public** line (`age1…`) into `scripts/backup/age-recipients.txt`
   (it's safe to share; a Claude session can commit it for you). Optional but
   wise: a second key held by someone else at school (e.g. the principal), one
   `age1…` line each. Either key can then open a backup.

### 2. Create the private backups repo
GitHub → New repository → name `school-app-backups`, **Private**, tick "Add a
README" (a release needs at least one commit). Nothing else goes in it.

### 3. Create a token that can only write to that repo
GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate:
- Repository access: **Only select repositories** → `school-app-backups`
- Permissions → Repository → **Contents: Read and write** (Metadata: read is automatic)
- Expiration: 1 year (put a calendar reminder to renew it; when it expires the
  backup fails and an issue opens)

### 4. Add the settings to `school-app`
`school-app` → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `SUPABASE_DB_URL` | Production project → **Connect** → **Session pooler** → URI, with `[YOUR-PASSWORD]` replaced (port **5432**, not 6543; the direct connection is IPv6-only, which GitHub runners lack). If the password has `@ : / ? #` in it, URL-encode them or reset the password to letters + digits |
| Secret | `BACKUP_REPO_TOKEN` | the token from step 3 |
| Variable | `BACKUP_REPO` | `axeofodinson/school-app-backups` |

### 5. Merge and run once
Scheduled workflows only run from the default branch, so merge this branch to
`main`. Then Actions → **Database backup** → Run workflow. In ~2 minutes a
release `db-…` appears in `school-app-backups` with the encrypted file and the
row counts in its notes. Do the **restore drill** below once now, so you know
the key works.

### 6. Keep-alive (optional, recommended for holidays)
The nightly backup already connects to the database every night, but whether
Supabase counts that as "activity" isn't documented, so a weekly REST read is
added too. To switch it on: secrets `SUPABASE_URL` (`https://<ref>.supabase.co`)
and `SUPABASE_ANON_KEY` (the public anon key the app ships), and variable
`KEEPALIVE` = `on`. It runs Wednesdays 09:23 PKT.

### If something fails
A scheduled failure opens an issue **"Nightly database backup failed"** in
`school-app` (GitHub notifies you of it). Typical causes: the token expired
(make a new one, update `BACKUP_REPO_TOKEN`); the DB password changed (update
`SUPABASE_DB_URL`); the project was paused (unpause in the dashboard);
`age-recipients.txt` has no key. The log never shows the connection string.

### Before risky work (e.g. OPS-remove-legacy)
Actions → Database backup → Run workflow → `keep_label` = `before-legacy-removal`.
That backup is tagged `keep-…` and is never pruned.

---

## Restore into a fresh project

Use this if production is lost or broken. **Never restore into the production
project itself**: the script refuses any database that already has app tables
or logins, so make a new project. You need the private key (USB stick).

### Tools (Windows, once)
- **Git for Windows** (gives "Git Bash"), age (setup step 1), and the
  **PostgreSQL command-line tools** of the same major version as Supabase
  (EDB installer from postgresql.org → tick only "Command Line Tools"). Supabase's
  version: dashboard → Settings → Infrastructure. A newer client also works.
- Or WSL/Ubuntu: `sudo apt install age postgresql-client`.

### Steps
1. Supabase → **New project** (same region; free tier allows 2 active projects:
   pause the dev project first if needed). Note the new DB password.
2. Download the backup: `school-app-backups` → Releases → pick one → the
   `.tar.age` file. (Check the sha256 in the release notes if you like:
   `sha256sum file`.)
3. New project → Connect → Session pooler URI → that is the target.
4. In Git Bash, from a checkout of `school-app`:
   ```bash
   export PG_BIN="/c/Program Files/PostgreSQL/17/bin"   # your version; omit on Linux
   export PATH="$PATH:/c/age"
   export TARGET_DB_URL='postgresql://postgres.<new-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
   scripts/backup/restore.sh ~/Downloads/school-db-20261124-2237Z.tar.age /e/school-backup-key.txt
   ```
   It prints five steps and ends with `OK: N tables, M rows, all counts match`.
   Anything else stops with the error and changes nothing in the step that failed
   (each step is one transaction); fix it and re-run in a **new** empty project.

### After a restore (the parts a database dump can't carry)
- [ ] **Auth settings** (Authentication → URL configuration): Site URL and
      redirect URLs (`schoolapp://auth-callback`, the web `/auth-callback`); the
      Google provider if it was on; email settings. Logins and PINs themselves
      are restored (the hashes are in the backup).
- [ ] **Storage files**: buckets and their rules are back, the files are not.
      Teachers re-upload anything still needed (see the gap below).
- [ ] **Edge Function** `send-message-push`: deploy it again and set its secrets
      (`supabase/functions/`).
- [ ] **Point the apps at the new project**: new URL + anon key in the EAS env
      (`docs/environment.md`) and the old app's config; rebuild/publish.
- [ ] Update `docs/environment.md` (production ref) and the seed's production
      guard, and the `SUPABASE_DB_URL` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets,
      so backups continue from the new project.
- [ ] Sign in as a teacher and as a student (admission no + PIN) to check.

---

## Quarterly restore drill (15 minutes, Jan / Apr / Jul / Oct)

A backup nobody has restored is a hope, not a backup. Real student data is in
the backup, so **never** restore it into the dev project (Claude has full access
there) or a PC that isn't yours.

1. Pause the dev project (Settings → General → Pause) so a third free project fits.
2. Create a project `restore-drill-YYYY-MM`.
3. Run the restore steps above with the newest backup. Expect `all counts match`.
4. In the drill project's SQL Editor:
   `select count(*) from students; select count(*) from auth.users;` matches
   production's numbers from that night (they're in the release notes).
5. **Delete the drill project** the same day (it holds real data). Restore the dev project.
6. Add a line below.

| Date | Backup used | Result | By |
|---|---|---|---|
| 2026-11-24 | local harness, synthetic seed (TEST_PLAN BK-1) | 45 tables / 48,740 rows match; every table's content identical | Claude (session OPS-backup) |

---

## Known gaps / later
- **Storage file contents** aren't backed up. Today only `assessment-files`
  (014) and project evidence (022) hold files. A follow-up can copy the buckets
  with the Storage API into the same encrypted release once uploads are in real use.
- Supabase-internal settings (Auth config, Edge Function secrets) are a checklist,
  not data. Keep them written down in `docs/environment.md`.
- The backup connects as `postgres` (needs to read `auth.users`). A dedicated
  read-only role would be tighter; it isn't possible without changes to
  Supabase-owned schemas.
- If `school-app` is a **public** repo, GitHub disables scheduled workflows
  after 60 days without commits; re-enable from the Actions tab (the failure
  issue won't open, because nothing runs). Private repos don't have this rule.
