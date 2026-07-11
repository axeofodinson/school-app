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

Then `eas build -p android --profile preview` (see `eas.json`; preview outputs an
installable APK).

## Note

The running Expo app reaches Supabase from the **phone/simulator**, not from this
container. You only need the Supabase entry above if code runs *inside the
session* against it (seed scripts, tests, a `supabase-js` check). npm is the one
that matters for work in the container, and it's on by default.

Env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are set in
the same environment editor — see the root `README.md`.
