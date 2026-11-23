# 15 — Rebuild: messaging and push notifications

**Model:** Opus · **Phase:** 1b · **Depends on:** 13 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **15** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/010_push_notifications_messaging.sql, db/012_messages_realtime.sql
- supabase/functions/send-message-push/
- old src/notifications/*

## Goal
School/class/student announcements with push on Android and in-app toasts everywhere (web included).

## Do
- Compose (admin/teacher → school/class/student), inbox for students, read state.
- Push via Expo on Android (reuse the Edge Function), Realtime-driven in-app toast on web/Chromebook (no Expo push on web), subscribe only while the app is foregrounded.
- Drop the debug_logs dependency (old Realtime debugging).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/messages, Edge Function update if needed

## Done when
- [ ] Message to a class reaches an Android phone as push and a web session as a toast within seconds; a student never sees another class's message (RLS).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **15** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
