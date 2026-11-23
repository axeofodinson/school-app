# 05 — Google sign-in and access tiers (prep-only vs school)

**Model:** Opus · **Phase:** 0 · **Depends on:** 03 · **Blocked by:** Must ship before the paid Play Store release

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **05** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DECISIONS.md #23 (access tiers)
- CLAUDE.md auth rules
- LMS_AUDIT §3.5 (relief rules for no-class users)

## Skills and MCPs to use
Skills: `supabase`. MCP: Supabase (dev project). Finish with `/security-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Play Store buyers sign in with Google and get Preparation only; school logins (admission no + PIN) get everything.

## Do
- Migration: `profiles.access_tier` text check in ('school','prep_only') default 'school' for existing rows; new Google sign-ups get 'prep_only' and role 'student' with no student_id (update handle_new_user carefully in a NEW function, don't edit applied migrations). An `is_school_member()` helper.
- RLS: prep-only users can use learning tables (learner_id = auth.uid()) and read approved practice/learn content; they can never read or write enrollments, assessments, exams, submissions, attendance, messages.
- Supabase Google OAuth (native: expo-auth-session / Google sign-in; web: OAuth redirect). Login screen: 'School login' (default) and 'Sign in with Google (Preparation only)'.
- UI gating: tabs/features hidden for prep_only with an explanation; Prepare uses automatic relief (no teacher).
- Upgrade path: a prep-only user who later enrolls can be linked by admin to their student record (merge learning history to the school account), logged in DECISIONS.

## Don't
- Don't let Google sign-in create staff or school-student access.
- Don't build billing (Play billing is a later decision).
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- migration + harness smoke test, auth UI changes, feature gating

## Done when
- [ ] Harness: prep_only user gets 0 rows from assessments/enrollments/attendance and can insert practice_attempts for itself.
- [ ] Google sign-in works on Android and web against the dev project (or marked unverified with steps).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **05** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
