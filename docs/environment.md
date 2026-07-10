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

## Note

The running Expo app reaches Supabase from the **phone/simulator**, not from this
container. You only need the Supabase entry above if code runs *inside the
session* against it (seed scripts, tests, a `supabase-js` check). npm is the one
that matters for work in the container, and it's on by default.

Env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are set in
the same environment editor — see the root `README.md`.
