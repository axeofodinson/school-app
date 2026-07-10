# School App

Bilingual (English + Urdu) school platform for a matric-level school (classes
PG–10). Two surfaces, one Supabase backend:

- **Student app** — students take assessments, see scores/attendance.
- **Admin/teacher console** — the office and teachers run the school.

**Stack:** Expo (React Native) + Supabase (Postgres + Auth + RLS + Storage).
Project rules live in [`CLAUDE.md`](./CLAUDE.md) and are non-negotiable.

## Project structure

```
.
├── App.js                # Root component (scaffold placeholder — no features yet)
├── index.js              # Expo entry point
├── app.json              # Expo app config
├── babel.config.js       # babel-preset-expo
├── .env.example          # Template for Supabase env vars (copy to .env)
├── assets/
│   └── fonts/            # Bundled Noto Nastaliq Urdu (.ttf) + OFL.txt — no CDN
├── locales/
│   ├── en.json           # English strings (source of truth for keys)
│   └── ur.json           # Urdu strings (human-written; never machine-translated)
├── src/
│   ├── lib/supabase.js   # Supabase client (reads env vars only)
│   ├── i18n/index.js     # i18n + I18nManager RTL toggle
│   ├── theme/fonts.js    # Bundled font map for expo-font (no CDN)
│   ├── components/       # Shared UI (empty)
│   ├── screens/          # Screens (empty — built in CLAUDE.md build order)
│   └── hooks/            # Custom hooks (empty)
└── db/
    ├── setup.sql         # One-shot Supabase setup — SOURCE OF TRUTH
    └── README.md         # How/what to run in the Supabase SQL Editor
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Apply the SQL in `db/` to your Supabase project, then promote your account to
the `developer` role. Full step-by-step (with the exact run order and the
one-time promotion query) is in [`db/README.md`](./db/README.md).

### 3. Configure environment variables

The app reads Supabase credentials from environment variables and never from
committed code. Two variables are required:

| Variable | What it is | Where to find it |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Project REST URL | Supabase → Project Settings → **Data API** → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | Supabase → Project Settings → **API Keys** → `anon` `public` |

The `anon` key is meant to be shipped to clients — RLS (not the key) is the
security boundary. **Never** put the `service_role` key in the app.

**Local development:** copy the template and fill in real values. `.env` is
gitignored, so it is never committed:

```bash
cp .env.example .env
# then edit .env with your project's URL + anon key
```

**Claude Code on the web / remote environments:** add the same two variables as
**environment variables** in the environment's configuration (see the setup
checklist reply / project docs) so sessions get them without a `.env` file on
disk and nothing sensitive is ever committed.

### 4. Run

```bash
npm start        # then press i / a, or scan the QR with Expo Go
```

## Conventions (see CLAUDE.md)

- Content is data, not code — syllabus lives in the DB.
- No hardcoded user-facing text — every English key needs an Urdu one.
- RTL, real empty states, and offline tolerance are part of "done".
- Roles are enforced by the DB (RLS), not app code.

## Fonts & RTL

The Urdu-capable **Noto Nastaliq Urdu** font is **bundled** into the app
(`assets/fonts/*.ttf`, loaded via `expo-font`) — never fetched from a CDN, since
the target network blocks some. It is licensed under the SIL Open Font License
(`assets/fonts/OFL.txt`). Layout direction is set at startup via
`applyLayoutDirection()` in `src/i18n/index.js`, which drives React Native's
`I18nManager` so the whole UI flips LTR/RTL with the active locale.
