# 00 — Visual identity and motion choreography

**Model:** Opus · **Phase:** 0 · **Depends on:** — · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **00** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- ARCHITECTURE.md §6b (motion system)
- LMS_AUDIT.md §3–4 (principles)
- old app screens in src/screens/ (what exists, not the style)

## Skills and MCPs to use
Skills: `frontend-design`, `design:design-system`, `design:ux-copy`, `design:accessibility-review`, `expo:expo-design-system`, `expo:expo-animation`, `artifact-design` (to publish the mockups for Hassan). MCP: Figma (optional). Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Design the new look and feel of the whole app (student, teacher, admin), so later sessions build to a spec instead of improvising.

## Do
- Define the visual identity: palette (light + dark, WCAG AA contrast), type scale for English and Urdu Nastaliq (line-height for Nastaliq!), spacing, radii, elevation, iconography style, illustration style for empty states.
- Define age presentation: primary (PG–5) bigger targets and friendlier tone vs middle/secondary (6–10) study-focused, using the same components.
- Define motion choreography per moment: screen transitions, answer feedback (correct / incorrect / why-wrong reveal), mastery ring fill, follow-up cleared, streak-free progress cues, sync states, empty states, celebrations. Give each a token (duration + spring preset) and say what the full / lite / off tiers do.
- Sketch the key screens as low-fi wireframes in markdown or SVG: student Home, Prepare tab (follow-ups first), lesson reader, practice question, exam screen (no motion), result; teacher surprise-exam launch (≤3 taps), live exam view, review queue; admin home.
- Write the tokens as a TypeScript file draft (colours, spacing, radii, type, motion) ready for session 02.

## Don't
- Don't write app screens or install packages.
- Don't add decorative motion that carries no meaning, or any motion on exam screens beyond the timer and save indicator.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- `DESIGN_SYSTEM.md` (identity, components list, screen wireframes, motion choreography table)
- `apps/mobile/ui/tokens.draft.ts` (if the app folder doesn't exist yet: `docs/design/tokens.draft.ts`, checked by `scripts/verify-design-tokens.mjs`; done this way on 2026-11-23)

## Done when
- [ ] Every motion moment has a token and a full/lite/off behaviour.
- [ ] Urdu type sample with line-heights is specified.
- [ ] Hassan has reviewed the wireframes: publish them as a private Artifact (or Figma file if the Figma plugin is on) and ask him to look before you finish.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **00** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
