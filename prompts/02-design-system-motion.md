# 02 — Design system and motion foundation

**Model:** Opus · **Phase:** 0 · **Depends on:** 00, 01 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **02** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DESIGN_SYSTEM.md
- ARCHITECTURE.md §6b
- CLAUDE.md Motion rules

## Skills and MCPs to use
Skills: `frontend-design`, `expo:expo-design-system`, `expo:expo-animation`, `expo:expo-ui`, `design:accessibility-review`, `run` (screenshot the gallery). Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Turn the design spec into reusable, RTL-safe, themed components and the motion tier system.

## Do
- `apps/mobile/ui/tokens.ts` and `ui/motion.ts` (durations, springs) from DESIGN_SYSTEM.md.
- Theme provider: light/dark, age presentation (primary vs secondary) switch.
- Primitives: Text (auto Nastaliq for Urdu), Button, IconButton, Card, ListItem, TextField, PinField, Badge, ProgressRing (mastery), EmptyState, Skeleton, Toast, Sheet/Modal, Tabs, SyncStatusPill.
- Motion tiers: detect full/lite/off (OS reduce-motion, device memory where available, user setting), a `useMotion()` hook so components read the tier; exam-mode context that forces off.
- Responsive layout helpers: breakpoints for phone / tablet-Chromebook / desktop, a two-pane layout.
- A hidden `/dev/gallery` route showing every component in both languages, both themes and all three tiers.

## Don't
- Don't animate layout properties.
- Don't hardcode colours or durations outside tokens.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- ui/ components + gallery route + tests for the tier logic in packages/core (pure function)

## Done when
- [ ] Gallery renders on web and Android in en/ur, light/dark, full/lite/off.
- [ ] Reduce-motion OS setting forces off.
- [ ] Exam-mode context disables all non-timer motion.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **02** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
