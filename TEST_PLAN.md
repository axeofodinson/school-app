# TEST_PLAN.md

Synthetic data only. Never run tests against production data.

## DB — schema and RLS

**DB-1 Local dry-run (every migration).** Throwaway Postgres 16, no Supabase:
```bash
BIN=$(ls -d /usr/lib/postgresql/*/bin); D=/var/lib/postgresql/smoke
su postgres -c "mkdir -p $D && $BIN/initdb -D $D/data -A trust && $BIN/pg_ctl -D $D/data -o '-k $D -p 54329 -c listen_addresses=' -l $D/log start"
P="psql -h $D -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t" && $P -d t -f db/test/supabase_stubs.sql
for f in db/setup.sql db/0*.sql; do $P -d t -f $f || echo "FAIL $f"; done
$P -d t -f db/017_lms_foundation.sql          # re-run = idempotency check
$P -d t -f db/test/017_smoke.sql
$P -d t -f db/test/022_smoke.sql               # after 017 smoke (reuses its fixtures)
su postgres -c "$BIN/pg_ctl -D $D/data stop" && rm -rf $D
```
(Run Postgres outside the Claude scratchpad; its permissions get reset.)
Result on 2026-11-23: all pass (see `LMS_AUDIT.md` §5.3).

**DB-2 RLS matrix.** For each new table × role (student own / other student / teacher own class / teacher other class / admin / Play Store learner): select/insert/update/delete expected allow/deny. Run as `set role authenticated` + `request.jwt.claim.sub`.

**DB-3 Answer-key leak.** As a student: `select answer from questions` must return 0 rows after 018; exam paper from `start_exam_session` must not contain `correct`.

## Design system (session 00 on)
- **DS-1 Token checks** (`npm test`, in `packages/core/test/design-tokens.test.ts` + `design-motion.test.ts`; moved from `scripts/verify-design-tokens.mjs` in session 02). WCAG AA for every declared colour pair in light and dark, every motion moment has full/lite/off with `off` = no motion, lite = fades only, exam mode resolves everything except timer + save indicator to none, tier picker and presentation rules, Urdu line-height ratio ≥ 1.9. Also: ink text on all 8 subject hues ≥ 4.5 in both themes, `hueForSubject` stable. Result 2026-11-23 (v0.2): 48/48 pairs pass, 8/8 hues pass, all checks pass. Session 02 added: danger-button and field-error pairs (54 pairs), breakpoints/layout, Urdu ratio after kid scaling, font-family picks, script detection, LTR isolation, device-memory rounding, tier precedence.
- **DS-2 Gallery** (`/dev/gallery`, dev builds or a web export with `EXPO_PUBLIC_DEV_GALLERY=1`; query `?lang=ur&theme=dark&tier=lite&p=kid&exam=1`). Web: Playwright screenshots of en/ur × light/dark × full/lite/off × kid/student/staff, no console errors; with `reducedMotion: 'reduce'` and tier=full the gallery reads "Tier now: off"; with `exam=1` only `examSaveIndicator` resolves to motion. Pattern drift (DECISIONS #47): full keeps moving, lite moves ~48 px in ~2 s then stops, off never moves, RTL mirrors x, exam draws no pattern. Result 2026-11-23/24 (session 02): pass on web (Chromium). **P-4 addition:** full tier with 3+ drifting subject cards on the reference 4 GB Chromebook holds 60 fps (unverified). **Android: unverified** (needs a dev build; open `/dev/gallery`, toggle the OS "Remove animations" setting and check the tier reads off).
- **T-1 Urdu type specimen** (unverified): render `urduSpecimens` at every type step on an Android phone, a school Chromebook (APK) and Chrome on Windows. Pass = no clipped marks in buttons, tabs, chips, timer bar; wraps cleanly. Fix line-heights in tokens only.
- **T-2 Tabular digits**: exam timer digits don't shift width in Nunito on Android and web.
- **T-3 Text at 200 %**: system font size 200 % on Android and browser zoom 200 %: no clipped text, no horizontal scroll, Urdu included.
- **V-1 Lesson visuals** (prompt 33): sample scene, chart and widget on the reference Chromebook (APK) and Chrome: 60 fps in full tier (Chrome performance panel / Perf Monitor), lite cross-fades only, off has no autoplay; offline pack plays all but video; "Text version" reads every caption; Urdu captions don't clip; SVG sanitiser rejects `<script>`, event attributes, `foreignObject`, external `href`.
- **A-1 Screen readers**: TalkBack (Android/ChromeOS) and NVDA (web): login, practice question + feedback, exam question + timer + submit, mastery ring label.

## Functional (per phase, `packages/core` unit tests in Node)
- F-1 Scoring per item type; mastery rule; relief rule (N rounds, exhausted pool); revision scheduling (7/30 d).
- F-2 Follow-up merge: repeated wrong answers and stacked exams → one open follow-up per concept/kind.
- F-3 Gate: diagnostic follow-up blocks next topic in that subject only; exam follow-up blocks Prepare only; teacher override logged.
- F-4 Exam: shuffle determinism per session; timer offset from `server_now`; auto-submit sweep.
- F-5 Importer: rejects missing concept, zero/two correct, missing cognitive_level; flags duplicates and missing Urdu.
- F-6 Worksheets: A/B sets differ in order, keys match.

## Offline (Phase 6)
O-1 … O-6 = the six cases in `LMS_AUDIT.md` §3.3, each scripted: airplane-mode on device, kill app mid-exam, two devices same student, 7-day offline then reconnect, logout with unsent queue then other student logs in (must see nothing), exam deadline while offline.

## Platform
- P-1 Android phone regression on every release.
- P-2 Chromebook (APK): window resize, landscape, keyboard Tab/Enter, mouse, file picker, push, Urdu rendering.
- P-3 Windows Chrome/Edge (web): login, teacher console, print A4.
- P-4 Performance on cheapest Chromebook: cold start < 5 s, question switch < 150 ms, Urdu screen scroll without jank.
- P-6 Motion: each tier (full/lite/off) on reference phone and Chromebook. Record frame drops during screen transitions and mastery animations (Perf Monitor / Chrome performance panel). The OS "reduce motion" setting forces the off tier. Exam screens show no animation apart from the timer and save indicator. Slide directions flip in Urdu.
- P-5 YouTube unlisted embed on lab Wi-Fi: Android, Chromebook, Windows.
- P-7 **CI on every push** (`.github/workflows/ci.yml`): `npm ci`, type-check (strict, both workspaces), eslint + prettier, `packages/core` vitest, the old `verify:grading`, and `expo export -p web`. Locally: the same `npm run` scripts (README §4).
- P-8 **Web shell smoke** (session 01, manual Playwright script, result 2026-11-23: pass): serve `apps/mobile/dist`, `/` redirects to `/login`; English is LTR; choosing اردو sets `<html dir="rtl" lang="ur">`, Urdu renders in the bundled Nastaliq; the choice survives a reload; `/learn`, `/classes`, `/school` and an unknown path show their empty states; no console errors, no request leaves localhost (no CDN). Becomes an automated Playwright test when session 02/03 adds e2e tooling.
- P-9 **Android dev build** (unverified): `cd apps/mobile && npx eas-cli build -p android --profile development`, install, run `npm run mobile:start`: login placeholder in EN and UR, layout mirrors in Urdu.

## Security
S-1 Shared device: no previous-student data visible after switch. S-2 No secrets in bundle (`grep` built JS for keys). S-3 `EXPLAIN ANALYZE` of RLS-heavy teacher queries on seeded data, p95 < 1 s.

## Seed (Phase 0)
- Target: **separate dev Supabase project** or local Postgres (never production).
- Idempotent: fixed UUID namespace (uuid v5 from a seed string) + `on conflict do nothing`.
- Creates: 656 students over PG–10 (~2 sections × ~30), ~30 teachers + assignments, 1 admin; auth users via the existing `provision_student_login`; 3 subjects × 6 chapters × 4 topics × 4 concepts; ~90 questions/topic (en + ur placeholder, ~10 % LaTeX, ~5 % SVG); placeholder lessons with sample images and one YouTube id; 3 months of practice attempts, diagnostics, open/cleared follow-ups, 10 past exams per class.
- Every row `is_test_data = true` (or linked to a flagged parent). Removal: one script deleting flagged rows child-first.

## Scale
- L-1 40 concurrent exam sessions (node script with 40 real JWTs: start → 20 saves each at random intervals → submit). Pass: 0 lost answers, p95 save < 500 ms, all results visible to teacher < 5 s after end.
- L-2 Worst case 5 classes × 40 simultaneously.
- L-3 DB size after seed + 1 simulated year < 300 MB.
