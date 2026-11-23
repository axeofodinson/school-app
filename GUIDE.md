# GUIDE.md — building the Al-Syed app with Claude Code, step by step

This is Hassan's playbook: what to set up once, how to run each session, which
skills and MCPs to use, and the exact order of work. Claude keeps it updated
(prompt `OPS-update-prompts`).

---

## 1. One-time setup (about an hour)

### 1.1 Repo
- [ ] Merge the planning branch `claude/stoic-bell-ji53ka` into `main` (GitHub → Pull requests → New → base `main`, compare `claude/stoic-bell-ji53ka` → Merge). Every new session starts from `main`.

### 1.2 Plugins (claude.ai → Claude Code → Plugins, or the install card in chat)
| Plugin | Why you need it | Used in prompts |
|---|---|---|
| **expo** (official) | Skills for expo-router, design systems, animation, EAS builds/updates, SDK upgrades + the Expo MCP | 01, 02, 13, 15, 16, 30–32 |
| **supabase** (official) | Supabase + Postgres best-practice skills + the Supabase MCP | 03–05, 12, 15, 20, 40, 50, 60–62, 72 |
| **frontend-design** (Anthropic) | High-quality, non-generic UI design and implementation | 00, 02, 10, 14, 16, 22, 30, 41, 70, 71, 80 |
| **design** (Anthropic) | `design-system`, `design-critique`, `ux-copy`, `accessibility-review`, `design-handoff` | 00, 02, 10, 16, 22, 41 |
| **figma** (optional) | Only if you want designs as editable Figma files; otherwise mockups are shared as private Artifacts | 00, 02 |

Already built into Claude Code (nothing to install): `/code-review`,
`/security-review`, `/simplify`, `run` (launch the app and take screenshots),
`dataviz` (charts), `claude-api`, plan mode, subagents.

### 1.3 Connectors (claude.ai → Settings → Connectors)
- [ ] **Context7**: up-to-date docs for Expo, React Native, Supabase, Reanimated, Moti. It stops Claude using outdated APIs. Useful in every build session.
- [ ] **GitHub**: already connected (needed for PRs and pushing).

### 1.4 Supabase
- [ ] Create the **dev project** (`docs/environment.md` → "Dev Supabase project").
- [ ] Connect the Supabase plugin's MCP to the **dev project only**. Never give Claude write access to the production project (CLAUDE.md database rules).

### 1.5 Cloud environment (claude.ai → Claude Code → the environment's settings)
- [ ] Network allow-list: your dev Supabase host, `expo.dev`, `*.expo.dev` (see `docs/environment.md`).
- [ ] Environment variables: `EXPO_TOKEN`, `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `DEV_SUPABASE_SERVICE_ROLE_KEY`. Secrets go in the secrets/credential form, never in chat.
- [ ] Optional: a setup script that runs `npm install` so each session starts ready (ask any session to "save the setup as the environment setup script").

### 1.6 Your PC (only for videos, Phase 9)
- [ ] Blender (you have it) + the community **Blender MCP**: install `uv`, add the Blender MCP server to Claude Code on your PC (`claude mcp add blender uvx blender-mcp`), install its Blender add-on, and press "Connect" in Blender's sidebar. Follow the MCP's README for the exact add-on file.
- [ ] Claude Code desktop or CLI on that PC. Cloud sessions can't reach Blender on your PC; prompt 90 runs locally.

---

## 2. How to run every session (the loop)

1. **Pick the next prompt** in `prompts/README.md` (first unticked whose dependencies are ticked).
2. **New session** on `school-app` (cloud is fine for everything except prompt 90). Opus.
3. **Paste the prompt** (everything below the line in the prompt file).
4. For big prompts, start in **plan mode** (Shift+Tab, or say "plan first"). Read the plan, answer its questions, approve.
5. While it works, you can watch, answer questions or step away. It stops when it needs you.
6. **Review before merging:**
   - Ask for screenshots: "use the run skill and show me the screens on phone and desktop width, English and Urdu".
   - Design-heavy work: "publish the mockups as an artifact" to get a private link you can open on your phone.
   - Ask it to run `/code-review`. For anything touching auth, RLS, exams or files, run `/security-review` too.
7. **Do the "Hassan must do" items** it reports (e.g. run a migration on Supabase, install a preview APK on a Chromebook).
8. **Merge** its branch into `main` (ask "open a PR", then merge it on GitHub).
9. If something changed your mind, run **`OPS-update-prompts`** with your notes. Don't edit plans by hand.

### Tips that save the most time
- **One prompt per session.** Long mixed sessions get confused; prompts are sized to fit.
- **"Continue" sessions:** if a session runs out, start a new one with the same prompt plus "Continue: see MODULE_STATUS for what's left".
- **Say what you see, not what to code.** "On the Chromebook the Urdu text is cut off at the bottom of the card" is perfect feedback.
- **Ask for options when unsure:** "give me 3 directions for the home screen as an artifact, I'll pick one".
- **Test on the real devices early:** a cheap Chromebook and a Windows PC with Chrome. Ask for an EAS preview APK whenever a phase ends.
- **Never paste keys or passwords in chat.** Use the environment's secret settings.

---

## 3. Skills and MCPs: when to say what

| You want… | Say / use |
|---|---|
| A distinctive, polished screen | "use the **frontend-design** skill" |
| A consistent component library / tokens | "use **design:design-system** and **expo:expo-design-system**" |
| Smooth, cheap-hardware-friendly animation | "use **expo:expo-animation**", following CLAUDE.md motion rules |
| Better button labels, empty states, errors (en + ur) | "use **design:ux-copy**" (Urdu still needs a teacher's review) |
| Accessibility check (contrast, tap size, keyboard) | "run **design:accessibility-review** on these screens" |
| An honest critique of a design | "use **design:design-critique**" |
| See the app running | "use the **run** skill and screenshot …" |
| Supabase schema/RLS done right | "use the **supabase** and **supabase-postgres-best-practices** skills; test on the dev project with the Supabase MCP" |
| Builds and OTA updates | "use **expo:eas-workflows** / **expo:eas-update**" |
| Up-to-date library APIs | "check **Context7** for the current Expo/Reanimated docs" |
| A bug you can't explain | "use **engineering:debug**" |
| Tests worth writing | "use **engineering:testing-strategy**" |
| Pre-release checklist | "use **engineering:deploy-checklist**" |
| Review before merge | `/code-review`, `/security-review`, `/simplify` |
| Charts for dashboards / item analysis | "use the **dataviz** skill" |
| Check a printed worksheet PDF | "use the **pdf** skill to check the A4 output" |
| Animated explainer (local PC) | Blender MCP: "build the scene from script.json in Blender, render 720p" |

---

## 4. The project, step by step

Tick these off as you go (sessions also tick `prompts/README.md`).

### Step A: before building (this week)
- [ ] §1 setup done (merge, plugins, Context7, dev Supabase project, env vars).
- [ ] Run **OPS-backup**: your real data gets a nightly backup before anything changes.

### Step B: Foundations (Phase 0, about 5–7 sessions)
- [ ] **00 Design identity.** You approve the look, the motion style and the key screens. Spend time here; everything else builds on it.
- [ ] **01 Scaffold.** The new app runs on Android and in the browser.
- [ ] **02 Design system + motion.** The component gallery; check it on a Chromebook.
- [ ] **03 Auth.** Admission no + PIN, QR cards, shared-device mode.
- [ ] **04 Seed.** 656 fake students in the dev project.
- [ ] **05 Google sign-in (prep-only).** Can wait until just before the paid Play Store release.

**Checkpoint:** log in as a fake student on a Chromebook (APK) and as a teacher on Windows (web).

### Step C: Replace the old app (Phases 1 + 1b, about 7 sessions)
- [ ] 10 → 11 → 12 → **13 cut-over** (you publish the new app; the answer-key hole is closed).
- [ ] 14 attendance → 15 messaging + push → 16 pre-reader.
- [ ] Use **OPS-remove-legacy** whenever old code or data gets in the way (after a backup).

**Checkpoint:** the old app is no longer needed.

### Step D: The LMS core (Phases 2–4, about 9 sessions + content)
- [ ] 20 run migration 017 + curriculum editors → 21 importer → 22 review queue.
- [ ] **Content in parallel:** use **C1** in claude.ai with Class 9 Math chapter 1 → import → teachers review (C2 helps) → approve.
- [ ] 30 Learn → 31 Practice → 32 offline packs.
- [ ] 40 mastery → 41 follow-ups, gates and Prepare tab → 42 spaced revision.

**Checkpoint:** a fake Class 9 student learns a topic, takes the diagnostic, gets follow-ups and clears them, all offline on a Chromebook.

### Step E: Exams and robustness (Phases 5–6, about 5 sessions)
- [ ] 50 surprise exam → 51 live view and results.
- [ ] 60 offline exams → 61 sync and shared devices → 62 load test (40 students).

**Checkpoint:** a real surprise exam with one class in the lab.

### Step F: Expansion (Phases 7–10)
- [ ] 70 worksheets → 71 assignments → 72 STEM projects.
- [ ] 80 dashboards.
- [ ] 90 animated explainers (on your PC with Blender) → 91 AI drafting (optional).
- [ ] E1–E4 extensions.
- Deferred: 81 parents, 82 iOS.

---

## 5. What Claude will ask you to do (and only you can do)
- Run migrations in the Supabase SQL Editor (production) when a session hands you a file.
- Install preview builds on a Chromebook / phone and say what you see.
- Approve designs and content; assign subject teachers to review Urdu.
- Create accounts and keys (dev Supabase project, Google OAuth, private backup repo, EAS).
- Decide when to publish to the Play Store.
