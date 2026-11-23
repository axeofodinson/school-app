# 03 — Login: students (admission no + PIN, QR) and staff

**Model:** Opus · **Phase:** 0 · **Depends on:** 01, 02 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **03** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/004_student_login.sql, db/008_revert_login_to_admission_number.sql, db/009 (login revoke)
- old src/auth/AuthProvider.js and src/screens/auth/*
- LMS_AUDIT.md §3.4 (shared devices)

## Skills and MCPs to use
Skills: `supabase`, `expo:expo-router`. MCP: Supabase (dev project). Finish with `/security-review` and `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Rebuild login on the new app, reusing the existing backend login design unchanged.

## Do
- Student login: admission number + PIN via `student_login_email()` RPC then `signInWithPassword` (exactly as the old app). Staff login: email + password. Role routing to (student)/(teacher)/(admin); pending + profile-error screens.
- QR card login: scanning fills the admission number only (camera on Android, webcam on web if available, manual entry fallback). Add a printable QR card generator for admins (A4 sheet, name + admission no + QR, no PIN).
- Shared-device mode (admin toggle per device): no remembered session, 10-min idle logout, big 'Switch student' button, per-user storage namespace in packages/core; logout wipes the namespace except unsynced queue (keep the namespace isolated).
- Session storage: SecureStore on native, localStorage on web.
- Leave a clear extension point for prompt 05 (Google sign-in, prep-only tier); don't build it here.

## Don't
- Don't change the auth backend or create email accounts for students.
- Don't print PINs on QR cards.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- auth feature, QR card generator, namespace storage adapter with tests

## Done when
- [ ] Student and staff can log in on web and Android against the dev project.
- [ ] After logout in shared mode, the next student sees no data from the previous one (manual test script in TEST_PLAN S-1).
- [ ] Withdrawn student (no active enrollment) cannot log in (db/009 behaviour).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **03** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
