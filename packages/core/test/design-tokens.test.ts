// Ported from scripts/verify-design-tokens.mjs (session 00) plus the helpers added in session 02.
import { describe, expect, it } from 'vitest';
import {
  BIDI,
  breakpointFor,
  colours,
  contrastPairs,
  contrastRatio,
  diagram,
  examSafeVisuals,
  hueForSubject,
  isolateLtrRuns,
  layoutFor,
  presentationForGrade,
  presentations,
  radiusFor,
  scriptOf,
  subjectHues,
  textMetrics,
  typeScale,
  urduSpecimens,
  urduTextRules,
  visualBudget,
  type TypeStep,
} from '../src/design';

const themes = ['light', 'dark'] as const;
const HEX = /^#[0-9A-F]{6}$/i;

describe('colour tokens', () => {
  it('light and dark define the same roles', () => {
    expect(Object.keys(colours.light).sort()).toEqual(Object.keys(colours.dark).sort());
  });

  for (const theme of themes) {
    for (const p of contrastPairs) {
      it(`${theme}: ${p.fg} on ${p.bg} ≥ ${p.min} (${p.why})`, () => {
        const r = contrastRatio(colours[theme][p.fg], colours[theme][p.bg]);
        expect(r).toBeGreaterThanOrEqual(p.min);
      });
    }
  }

  it('every subject hue carries ink text at ≥ 4.5:1 in both themes', () => {
    // Text on a hue is always the light-theme ink (#1B1A3A); the dark `ink` is a shadow colour.
    for (const [name, h] of Object.entries(subjectHues)) {
      for (const theme of themes) {
        expect(
          contrastRatio(colours.light.ink, h[theme]),
          `${name} ${theme}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('hueForSubject is stable and honours a valid colour key', () => {
    expect(hueForSubject('abc')).toBe(hueForSubject('abc'));
    expect(hueForSubject('abc', 'coral')).toBe('coral');
    expect(Object.keys(subjectHues)).toContain(hueForSubject('xyz', 'not-a-hue'));
    expect(Object.keys(subjectHues)).toContain(hueForSubject(''));
  });

  it('opaque colour tokens are #RRGGBB (contrast maths depends on it)', () => {
    for (const theme of themes) {
      for (const [role, v] of Object.entries(colours[theme])) {
        if (role !== 'scrim') expect(v, role).toMatch(HEX);
      }
    }
  });
});

describe('lesson visual tokens', () => {
  it('diagram meaning colours are visible strokes on white (≥ 3:1)', () => {
    for (const k of ['ink', 'focus', 'result', 'wrongIdea', 'guide'] as const) {
      expect(contrastRatio(diagram[k], '#FFFFFF'), k).toBeGreaterThanOrEqual(3);
    }
  });
  it('exams allow only static visuals; budgets are sane', () => {
    expect([...examSafeVisuals].sort()).toEqual(['chart', 'figure']);
    expect(visualBudget.stepMaxMs).toBeLessThan(visualBudget.pauseRequiredAfterMs);
  });
});

describe('type', () => {
  it('Urdu line-heights meet the minimum ratio at every step', () => {
    for (const [step, m] of Object.entries(typeScale.urdu)) {
      expect(m.lineHeight / m.size, step).toBeGreaterThanOrEqual(
        urduTextRules.minLineHeightRatio - 0.001,
      );
    }
  });

  it('presentation scaling keeps the Urdu ratio and makes kid text bigger', () => {
    for (const step of Object.keys(typeScale.urdu) as TypeStep[]) {
      const kid = textMetrics(step, 'urdu', 'kid');
      const student = textMetrics(step, 'urdu', 'student');
      expect(kid.lineHeight / kid.fontSize).toBeGreaterThanOrEqual(
        urduTextRules.minLineHeightRatio - 0.05,
      );
      expect(kid.fontSize).toBeGreaterThan(student.fontSize);
    }
  });

  it('picks bundled families: Nastaliq for Urdu, Baloo for display, Nunito for body', () => {
    expect(textMetrics('title', 'urdu', 'student').fontFamily).toBe('NotoNastaliqUrdu-Bold');
    expect(textMetrics('body', 'urdu', 'student').fontFamily).toBe('NotoNastaliqUrdu-Regular');
    expect(textMetrics('display', 'latin', 'student').fontFamily).toBe('Baloo2-ExtraBold');
    expect(textMetrics('heading', 'latin', 'student').fontFamily).toBe('Baloo2-SemiBold');
    expect(textMetrics('body', 'latin', 'student').fontFamily).toBe('Nunito-Regular');
    expect(textMetrics('label', 'latin', 'staff').fontFamily).toBe('Nunito-Bold');
  });

  it('detects script from content', () => {
    expect(scriptOf('Hello')).toBe('latin');
    expect(scriptOf('8/10')).toBe('latin');
    for (const s of urduSpecimens) expect(scriptOf(s.text)).toBe('urdu');
  });

  it('isolates Latin and number runs inside Urdu, as one unit', () => {
    const { LRI: L, PDI: P } = BIDI;
    expect(isolateLtrRuns('ٹیسٹ میں 8/10 نمبر')).toBe(`ٹیسٹ میں ${L}8/10${P} نمبر`);
    expect(isolateLtrRuns('حل کرو: x + 2 = 5')).toBe(`حل کرو: ${L}x + 2 = 5${P}`);
    expect(isolateLtrRuns('درجہ حرارت -5 ہے')).toBe(`درجہ حرارت ${L}-5${P} ہے`);
    expect(isolateLtrRuns('حل کرو (x + 2)')).toBe(`حل کرو ${L}(x + 2)${P}`);
    // Latin-only text and already-isolated text are left alone.
    expect(isolateLtrRuns('8/10 marks')).toBe('8/10 marks');
    const once = isolateLtrRuns('ٹیسٹ 5 cm');
    expect(isolateLtrRuns(once)).toBe(once);
  });
});

describe('presentations and layout', () => {
  it('maps grade to presentation (PG and 1–5 kid, 6–10 and no class student)', () => {
    expect(presentationForGrade(-2)).toBe('kid');
    expect(presentationForGrade(0)).toBe('kid');
    expect(presentationForGrade(5)).toBe('kid');
    expect(presentationForGrade(6)).toBe('student');
    expect(presentationForGrade(9)).toBe('student');
    expect(presentationForGrade(null)).toBe('student');
    expect(presentationForGrade(undefined)).toBe('student');
  });

  it('touch targets meet platform minimums', () => {
    expect(presentations.kid.minTarget).toBeGreaterThanOrEqual(48);
    expect(presentations.student.minTarget).toBeGreaterThanOrEqual(48);
    expect(presentations.staff.minTarget).toBeGreaterThanOrEqual(44);
  });

  it('breakpoints: phone < 600 ≤ tablet < 900 ≤ desktop < 1280 ≤ wide', () => {
    expect(breakpointFor(360)).toBe('phone');
    expect(breakpointFor(599)).toBe('phone');
    expect(breakpointFor(600)).toBe('tablet');
    expect(breakpointFor(899)).toBe('tablet');
    expect(breakpointFor(900)).toBe('desktop');
    expect(breakpointFor(1280)).toBe('wide');
  });

  it('two-pane and side rail from desktop; kid phone gutter 20', () => {
    expect(layoutFor(400, 'student')).toMatchObject({
      twoPane: false,
      navigation: 'bar',
      gutter: 16,
    });
    expect(layoutFor(400, 'kid').gutter).toBe(20);
    expect(layoutFor(700, 'student')).toMatchObject({
      twoPane: false,
      gutter: 24,
      maxContentWidth: 680,
    });
    expect(layoutFor(1000, 'staff')).toMatchObject({ twoPane: true, navigation: 'rail' });
  });

  it('kid radius is +4, capsules stay capsules', () => {
    expect(radiusFor('md', 'kid')).toBe(16);
    expect(radiusFor('md', 'student')).toBe(12);
    expect(radiusFor('full', 'kid')).toBe(9999);
  });
});
