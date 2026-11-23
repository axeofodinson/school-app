# 01 — App scaffold: Expo + TypeScript + expo-router + web

**Model:** Opus · **Phase:** 0 · **Depends on:** 00 (tokens can follow later) · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **01** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- ARCHITECTURE.md §1–2
- DECISIONS.md #1–5
- package.json and app.json of the old app (for EAS project id, package name, update URL)
- docs/environment.md (EAS + network)

## Skills and MCPs to use
Skills: `expo:expo-overview`, `expo:expo-project-structure`, `expo:expo-router`, `expo:expo-upgrade`. MCP: Context7 for current Expo/Supabase docs. Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Create the new app skeleton that builds for Android and web, beside the old app, without breaking it.

## Do
- Set up an npm workspaces monorepo: root package.json with workspaces `apps/*`, `packages/*`. The old app must still run (move it later; for now keep root scripts working, or move the old app to `apps/legacy/` only if that's trivial and tested).
- Create `apps/mobile` with the latest stable Expo SDK, TypeScript strict, expo-router, react-native-web, react-dom, @expo/metro-runtime, Reanimated, gesture-handler, safe-area-context.
- Reuse the same Android package (`com.school.app`) and EAS project id as the old app so the Play Store listing is updated, not duplicated. Set `orientation: default`. Note: the cut-over build replaces the old app, so don't publish until Phase 1 parity is done.
- Route groups: `(auth)`, `(student)`, `(teacher)`, `(admin)`, placeholder screens with real empty states.
- Create `packages/core` (pure TS, vitest or node:test) with one sample test. Port one pure module as proof (e.g. `src/reporting/grading.js` → `packages/core/grading.ts` with its existing `scripts/verify-grading.mjs` cases as tests).
- Supabase client with env vars (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`), typed via `supabase gen types` output committed to `packages/core/db-types.ts` (if the CLI can't reach the project, generate from the local harness DB).
- i18n setup reusing `locales/en.json` / `locales/ur.json` (copy, don't move) with a typed `t()`; Nastaliq fonts bundled; direction from locale state.
- Scripts: `typecheck`, `lint` (eslint + prettier), `test`, `web`, `android`. A GitHub Actions workflow running typecheck + lint + core tests on push.

## Don't
- Don't build feature screens.
- Don't delete or break `src/`.
- Don't add CDN links.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- apps/mobile skeleton, packages/core, CI workflow, updated README run instructions

## Done when
- [ ] `npx expo export -p web` succeeds and the web build shows the login placeholder in English and Urdu (RTL).
- [ ] Android dev build or `expo start` runs (or mark unverified with the command Hassan should run).
- [ ] CI green; core tests pass; old app `npm start` still works.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **01** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
