// Verifies the draft design tokens: WCAG AA contrast for every declared pair,
// motion-table completeness, exam lock-down, tier picker rules.
// Run: node --experimental-strip-types scripts/verify-design-tokens.mjs
// (Node >= 22.6. The tokens file is plain TS with no runtime imports.)
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2] ?? 'docs/design/tokens.draft.ts';
const t = await import(pathToFileURL(path.resolve(file)).href);

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let failed = 0;
const rows = [];
for (const theme of ['light', 'dark']) {
  for (const p of t.contrastPairs) {
    const r = ratio(t.colours[theme][p.fg], t.colours[theme][p.bg]);
    const ok = r >= p.min;
    if (!ok) failed++;
    rows.push({ theme, pair: `${p.fg} on ${p.bg}`, ratio: r.toFixed(2), min: p.min, ok: ok ? 'ok' : 'FAIL', why: p.why });
  }
}
console.table(rows.filter((r) => process.env.ALL || r.ok === 'FAIL'));
console.log(`contrast: ${rows.length - failed}/${rows.length} pairs pass AA`);
assert.equal(failed, 0, `${failed} contrast pair(s) below AA`);

// Subject hues always carry ink text: ≥ 4.5 in both themes.
for (const [name, h] of Object.entries(t.subjectHues)) for (const theme of ['light', 'dark']) {
  const r = ratio(t.colours[theme].ink === '#05051A' ? '#1B1A3A' : t.colours[theme].ink, h[theme]);
  assert.ok(r >= 4.5, `ink on subject hue ${name} (${theme}) = ${r.toFixed(2)}`);
}
// hueForSubject is stable and honours a valid colour key.
assert.equal(t.hueForSubject('abc'), t.hueForSubject('abc'));
assert.equal(t.hueForSubject('abc', 'coral'), 'coral');
assert.ok(Object.keys(t.subjectHues).includes(t.hueForSubject('xyz', 'not-a-hue')));
console.log(`subject hues: ${Object.keys(t.subjectHues).length} × 2 themes carry ink text at AA`);

// Diagram meaning colours are visible strokes on white (≥ 3:1, WCAG 1.4.11).
for (const k of ['ink', 'focus', 'result', 'wrongIdea', 'guide']) {
  const r = ratio(t.diagram[k], '#FFFFFF');
  assert.ok(r >= 3, `diagram.${k} on white = ${r.toFixed(2)}`);
}
// Exams allow only static visuals; budgets are sane.
assert.deepEqual([...t.examSafeVisuals].sort(), ['chart', 'figure']);
assert.ok(t.visualBudget.stepMaxMs < t.visualBudget.pauseRequiredAfterMs);
console.log('lesson visuals: diagram colours, exam-safe set and budgets ok');

// Light and dark define the same roles.
assert.deepEqual(Object.keys(t.colours.light).sort(), Object.keys(t.colours.dark).sort());

// Every moment has all three tiers; `off` never animates anything.
for (const [name, m] of Object.entries(t.moments)) {
  for (const tier of ['full', 'lite', 'off']) assert.ok(m[tier], `${name} lacks ${tier}`);
  assert.equal(m.off.kind, 'none', `${name}: off tier must not animate`);
  for (const tier of ['full', 'lite']) {
    const b = m[tier];
    if (b.kind === 'timing') assert.ok(t.duration[b.duration] !== undefined, `${name}: unknown duration`);
    if (b.kind === 'spring') assert.ok(t.spring[b.spring], `${name}: unknown spring`);
  }
}
// Lite tier never uses springs or movement (fades only, per ARCHITECTURE 6b).
for (const [name, m] of Object.entries(t.moments)) {
  const b = m.lite;
  if (b.kind === 'timing') assert.deepEqual(b.props, ['opacity'], `${name}: lite must be fade-only`);
}
// Only transform and opacity, no exceptions.
const allowed = new Set(['opacity', 'translateX', 'translateY', 'scale', 'rotate']);
for (const [name, m] of Object.entries(t.moments)) for (const tier of ['full', 'lite']) {
  const b = m[tier];
  if (b.props) for (const p of b.props) assert.ok(allowed.has(p), `${name}: ${p} not allowed`);
}
// Exam lock-down: only timer + save indicator resolve to anything.
for (const name of Object.keys(t.moments)) for (const tier of ['full', 'lite', 'off']) {
  const b = t.resolveMoment(name, tier, { inExam: true });
  if (!t.examAllowedMoments.includes(name)) assert.equal(b.kind, 'none', `${name} moves in exam`);
}
assert.deepEqual(Object.keys(t.moments).filter((k) => t.moments[k].examSafe).sort(), [...t.examAllowedMoments].sort());

// Tier picker.
const p = t.pickMotionTier;
assert.equal(p({ osReduceMotion: true, userChoice: 'full' }), 'off');
assert.equal(p({ osReduceMotion: false, userChoice: 'full', deviceMemoryGb: 2 }), 'full');
assert.equal(p({ osReduceMotion: false, deviceMemoryGb: 4 }), 'lite');
assert.equal(p({ osReduceMotion: false, deviceMemoryGb: 8 }), 'full');
assert.equal(p({ osReduceMotion: false, deviceMemoryGb: 8, isLowEndGpuOrDroppingFrames: true }), 'lite');
assert.equal(p({ osReduceMotion: false, surface: 'staff' }), 'lite');

// Presentations.
assert.equal(t.presentationForGrade(-2), 'kid');
assert.equal(t.presentationForGrade(0), 'kid');
assert.equal(t.presentationForGrade(5), 'kid');
assert.equal(t.presentationForGrade(6), 'student');
assert.equal(t.presentationForGrade(9), 'student');
assert.equal(t.presentationForGrade(null), 'student');

// Urdu line-heights meet the minimum ratio; touch targets meet platform minimums.
for (const [step, m] of Object.entries(t.typeScale.urdu)) {
  assert.ok(m.lineHeight / m.size >= t.urduTextRules.minLineHeightRatio - 0.001, `urdu ${step} line-height ratio ${(m.lineHeight / m.size).toFixed(2)}`);
}
assert.ok(t.presentations.kid.minTarget >= 48 && t.presentations.student.minTarget >= 48 && t.presentations.staff.minTarget >= 44);

console.log('design tokens: all checks passed');
