# Cloud environment — network config

Network settings for the Claude Code on the web environment. Edit them via the
cloud-icon → hover the environment → gear → **Network access**.
See [the docs](https://code.claude.com/docs/en/claude-code-on-the-web#network-access).

## npm — no action needed

The default **Trusted** access level already allowlists the common package
registries, including `registry.npmjs.org`. Only re-add it if you switch to
**Custom** *without* ticking the "include default package managers" box.

## Supabase — one Custom allowlist entry

Supabase is **not** in the Trusted defaults. Select **Custom**, tick
**"Also include default list of common package managers"** (keeps npm), and add
to **Allowed domains**:

```
invggaerwfsoslsibwwo.supabase.co
```

One host covers REST, Auth, Storage, and Realtime (Realtime is `wss://` to the
same host). Use `*.supabase.co` if you'd rather not pin the project ref.

## EAS builds (from inside a session)

Running `eas build` from a cloud session needs two things the default env lacks:

- **`EXPO_TOKEN`** set in the environment variables (a fresh session is required
  for a newly-added var to appear).
- **Expo domains on the allowlist** — add to the **Custom** allowed domains:

  ```
  expo.dev
  *.expo.dev
  ```

  Artifact upload uses `storage.googleapis.com`, already covered by the Trusted
  defaults. Without these, `api.expo.dev` returns proxy 403 and the build can't be
  submitted.

### Baking EXPO_PUBLIC_* into a build

EAS builds run on Expo's servers, not in this container, so the container's env
vars do **not** reach the build. Set the two public vars as **EAS environment
variables** (environment: `preview`, visibility: plaintext — the anon key is
public and is inlined into the app bundle anyway):

```
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <key> --visibility plaintext
```

Run EAS commands for the **new** app from `apps/mobile/` (it has its own `eas.json`
and `app.json` with the same project id; DECISIONS #40). From the repo root they build
the old app. Then `eas build -p android --profile preview` (see `eas.json`; preview outputs an
installable APK).

## Note

The running Expo app reaches Supabase from the **phone/simulator**, not from this
container. You only need the Supabase entry above if code runs *inside the
session* against it (seed scripts, tests, a `supabase-js` check). npm is the one
that matters for work in the container, and it's on by default.

Env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are set in
the same environment editor — see the root `README.md`.

## Dev Supabase project (DECISIONS #27)

All seeding, load tests and feature testing use a **second, free Supabase
project**, never the production one.

1. Create a new project in the Supabase dashboard (e.g. `school-app-dev`, same region).
2. In its SQL Editor run `db/setup.sql`, then every `db/0NN_*.sql` in order. This is
   the one place running `setup.sql` is fine: the project is empty and disposable.
3. Add its host to the cloud environment's allowed domains (like the production
   entry above).
4. Add environment variables for sessions: `DEV_SUPABASE_URL` and
   `DEV_SUPABASE_ANON_KEY` (done). Never put a service-role key or DB password
   in the app or in `EXPO_PUBLIC_*` variables.
5. For dev builds of the app, point `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` at the dev project.
6. Seed it (prompt 04): in the dev project's SQL Editor paste
   `scripts/seed/sql/seed-dev.sql` and Run (undo: `remove-dev.sql`). Or, from your PC, set
   `SEED_DATABASE_URL` to the dev project's **session pooler** URL (Dashboard →
   Connect; it contains the DB password, so keep it out of the repo and the
   cloud environment) and `DEV_SUPABASE_URL`, then `npm run seed:dev`. The
   cloud container can't reach Postgres ports, only HTTPS. The script refuses
   the production ref and anything not on its dev allow-list.

## Google sign-in (prompt 05, dev project first)

Prep-only Google sign-in needs `db/017` and `db/023` applied on the project and:

1. **Google Cloud console** → APIs & Services → Credentials → *Create OAuth client ID* →
   type **Web application**. Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. (The OAuth consent screen needs
   an app name, support email and the `email`/`profile` scopes; publish it before the Play release.)
2. **Supabase** → Authentication → Providers → **Google**: enable, paste the client ID and
   secret. Leave "manual linking" off.
3. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add
   `schoolapp://auth-callback` (Android), `http://localhost:8081/auth-callback` (web dev) and
   the deployed web origin + `/auth-callback`.
4. Rebuild the Android dev client (new native module `expo-web-browser`).
5. Turn the button on: set `EXPO_PUBLIC_GOOGLE_SIGNIN=1` (EAS env var for builds, `.env` for local web). Without it the login screen shows school login only. **Status 2026-11-24:** Hassan couldn't create the Google Cloud OAuth client yet, so this is postponed; the flag stays off.

The Android app uses a browser tab (Custom Tab) to show Google's sign-in page, so it needs no SHA-1 or Android OAuth client.

## Backups (GitHub Actions settings)

Nightly backups and the keep-alive read these `school-app` repo settings
(Settings → Secrets and variables → Actions); full steps in
[`docs/backup-restore.md`](backup-restore.md): secrets `SUPABASE_DB_URL`
(production session pooler, :5432), `BACKUP_REPO_TOKEN`, optional
`SUPABASE_URL` + `SUPABASE_ANON_KEY`; variables `BACKUP_REPO`, optional
`KEEPALIVE=on`. If the production project ever changes, update them.

## Web app on EAS Hosting (updated after every web-facing session)

Production: https://ice-010-school-app.expo.app (Expo account `ice_010`,
project `d0d4fed8-…`). The cloud environment has `EXPO_TOKEN` and the
`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` the build bakes in. After a session merges
web-facing changes to `main`:
```bash
cd apps/mobile && rm -rf dist && npx expo export -p web
npx eas-cli@latest deploy --prod --non-interactive
```
Check that the deployment URL serves the new `entry-*.js` (compare with
`dist/index.html`). The production alias's HTML is cached at the edge and can
take ~5 minutes to switch (2026-11-24: prompt 10 deploy).
