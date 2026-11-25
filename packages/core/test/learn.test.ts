import { describe, expect, it } from 'vitest';

import {
  assignQuickChecks,
  buildLesson,
  clampStep,
  fitBox,
  lessonConceptIds,
  lessonKeyAction,
  lessonMathKeys,
  lessonQuestionIds,
  mathBox,
  parseLessonText,
  pickLang,
  plainLabel,
  stageAspect,
  svgAspect,
  videoFallback,
  visualText,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from '../src/learn';

const fig = (extra = {}) => ({
  type: 'figure',
  alt: { en: 'A cell', ur: 'خلیہ' },
  svg: '<svg/>',
  ...extra,
});

describe('pickLang', () => {
  it('reading language first, else the other one marked as fallback', () => {
    expect(pickLang({ en: 'Hi', ur: 'سلام' }, 'ur')).toEqual({
      text: 'سلام',
      lang: 'ur',
      fallback: false,
    });
    expect(pickLang({ en: 'Hi', ur: '  ' }, 'ur')).toEqual({
      text: 'Hi',
      lang: 'en',
      fallback: true,
    });
    expect(pickLang('plain', 'ur')).toEqual({ text: 'plain', lang: 'ur', fallback: false });
    expect(pickLang({}, 'en')).toBeNull();
    expect(pickLang(null, 'en')).toBeNull();
  });
});

describe('buildLesson', () => {
  it('objectives apart; a visual takes the lead text before it as its caption', () => {
    const m = buildLesson([
      { type: 'objectives', en: '- know cells' },
      { type: 'intro', en: 'Cells are tiny.' },
      fig(),
      { type: 'detailed', en: 'Longer text' },
      { type: 'misconception', en: 'Not all cells are round' },
      { type: 'quick_check', en: 'Which part?', concept_id: 'k1' },
    ]);
    expect(m.objectives).toHaveLength(1);
    expect(m.sections).toHaveLength(1);
    const s = m.sections[0]!;
    expect(s.kind).toBe('visual');
    expect(s.visual?.blockIndex).toBe(2);
    expect(s.lead.map((b) => b.en)).toEqual(['Cells are tiny.']);
    expect(s.more).toHaveLength(1);
    expect(s.watchOut).toHaveLength(1);
    expect(s.checks).toEqual([
      expect.objectContaining({ blockIndex: 5, questionId: null, conceptId: 'k1' }),
    ]);
  });

  it('a new visual or new lead text after something was said opens a section; summary last', () => {
    const m = buildLesson([
      { type: 'simple', en: 'One' },
      { type: 'detailed', en: 'One more' },
      { type: 'simple', en: 'Two' },
      fig(),
      fig({ alt: { en: 'Second' } }),
      { type: 'simple', en: 'caption of second' },
      { type: 'summary', en: 'Done' },
      { type: 'nonsense', en: 'skipped' },
      'not a block',
    ]);
    expect(m.sections.map((s) => s.kind)).toEqual(['text', 'visual', 'visual', 'summary']);
    expect(m.sections[1]!.lead[0]!.en).toBe('Two');
    expect(m.sections[2]!.lead[0]!.en).toBe('caption of second');
    expect(m.sections.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it('reads old `visual` + `media` drafts as figures', () => {
    const m = buildLesson([{ type: 'visual', media: '<svg/>', alt: { en: 'x' } }]);
    expect(m.sections[0]!.visual!.block).toMatchObject({ type: 'figure', svg: '<svg/>' });
    expect(m.sections[0]!.visual!.block.media).toBeUndefined();
  });

  it('text after the summary starts a fresh section; empty input is empty', () => {
    const m = buildLesson([
      { type: 'summary', en: 'S' },
      { type: 'worked_example', en: 'W' },
    ]);
    expect(m.sections.map((s) => s.kind)).toEqual(['summary', 'text']);
    expect(buildLesson(null)).toEqual({ objectives: [], sections: [] });
  });

  it('collects concepts and named questions', () => {
    const blocks = [
      { type: 'simple', en: 'a', concept_id: 'k1' },
      { type: 'quick_check', en: 'q', question_id: 'q9' },
      { type: 'scene', alt: { en: 'x' }, predict_question_id: 'q7', concept_id: 'k2' },
      { type: 'quick_check', en: 'q', concept_id: 'k3' },
    ];
    const m = buildLesson(blocks);
    expect(lessonConceptIds(m).sort()).toEqual(['k1', 'k2', 'k3']);
    expect(lessonQuestionIds(blocks).sort()).toEqual(['q7', 'q9']);
  });
});

describe('assignQuickChecks', () => {
  const m = buildLesson([
    { type: 'simple', en: 'a', concept_id: 'k1' },
    { type: 'quick_check', en: 'named', question_id: 'q-named' },
    { type: 'quick_check', en: 'by concept' },
    { type: 'quick_check', en: 'second by concept' },
    { type: 'quick_check', en: 'named but not approved', question_id: 'q-draft' },
    { type: 'quick_check', en: 'other concept', concept_id: 'k9' },
  ]);
  it('named item when readable, else unused items of the concept, else null', () => {
    const map = assignQuickChecks(m, [
      { questionId: 'q-named', conceptId: 'k1' },
      { questionId: 'q-a', conceptId: 'k1' },
      { questionId: 'q-b', conceptId: 'k1' },
    ]);
    expect(Object.fromEntries(map)).toEqual({
      1: 'q-named',
      2: 'q-a',
      3: 'q-b',
      4: null, // pool exhausted for k1; the draft item is never shown
      5: null,
    });
  });
  it('an empty pool shows every check as a prompt', () => {
    expect([...assignQuickChecks(m, []).values()].every((v) => v === null)).toBe(true);
  });
});

describe('maths', () => {
  it('collects keys from every text field, not from SVG or ids', () => {
    const keys = lessonMathKeys([
      { type: 'simple', en: 'Solve $2x = 4$', ur: 'حل $2x = 4$' },
      { type: 'figure', svg: '<svg>$not$</svg>', alt: { en: 'graph of $$y = x$$' } },
      { type: 'compare', left: { title: { en: '$a_1$' } }, right: { text: { en: 'no maths' } } },
    ]);
    expect(keys.sort()).toEqual(['2x = 4', 'D:y = x', 'a_1']);
  });

  it('keeps maths whole inside Markdown', () => {
    const [p] = parseLessonText('If $x_1 + y_1 = 2$ then **done** costs \\$5');
    expect(p).toEqual({
      type: 'paragraph',
      spans: [
        { text: 'If ' },
        {
          text: 'x_1 + y_1 = 2',
          math: { key: 'x_1 + y_1 = 2', tex: 'x_1 + y_1 = 2', display: false },
        },
        { text: ' then ' },
        { text: 'done', bold: true },
        { text: ' costs $5' },
      ],
    });
  });

  it('display maths, lists and code', () => {
    const blocks = parseLessonText('$$a^2$$\n\n- one $b$\n- two\n\n```\n$c$\n```');
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      spans: [{ text: 'a^2', math: { key: 'D:a^2', tex: 'a^2', display: true } }],
    });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false });
    expect((blocks[1] as { items: { math?: unknown }[][] }).items[0]![1]!.math).toBeTruthy();
    expect(blocks[2]).toEqual({ type: 'code', text: '$c$' });
  });

  it('an unclosed dollar stays text', () => {
    expect(parseLessonText('costs $5')).toEqual([
      { type: 'paragraph', spans: [{ text: 'costs $5' }] },
    ]);
  });

  it('sizes MathJax SVG from ex units, else from the viewBox', () => {
    const svg =
      '<svg width="4" height="2" style="vertical-align: -0.5ex" viewBox="0 0 10 5"></svg>'.replace(
        'width="4" height="2"',
        'width="4ex" height="2ex"',
      );
    expect(mathBox(svg, 20)).toEqual({ width: 36, height: 18, baselineShift: -4.5 });
    expect(mathBox('<svg viewBox="0 -10 30 10"/>', 10)).toEqual({
      width: 36,
      height: 12,
      baselineShift: 0,
    });
    expect(mathBox('<svg/>', 10)).toEqual({ width: 12, height: 12, baselineShift: 0 });
  });
});

describe('plainLabel', () => {
  it('first line, no marks, maths as TeX, cut at a word', () => {
    expect(plainLabel('\n**Speed** is $d/t$\nmore')).toBe('Speed is d/t');
    expect(plainLabel('word '.repeat(30), 20)).toBe('word word word word…');
    expect(plainLabel(null)).toBe('');
  });
});

describe('controls', () => {
  it('arrow keys mirror in Urdu; space plays; F fullscreen', () => {
    expect(lessonKeyAction('ArrowRight', false)).toBe('next');
    expect(lessonKeyAction('ArrowRight', true)).toBe('prev');
    expect(lessonKeyAction('ArrowLeft', true)).toBe('next');
    expect(lessonKeyAction(' ', false)).toBe('play');
    expect(lessonKeyAction('F', false)).toBe('fullscreen');
    expect(lessonKeyAction('End', false)).toBe('last');
    expect(lessonKeyAction('x', false)).toBeNull();
  });
  it('clamps steps', () => {
    expect(clampStep(5, 3)).toBe(2);
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(Number.NaN, 3)).toBe(0);
    expect(clampStep(2, 0)).toBe(0);
  });
  it('stage shapes', () => {
    expect(stageAspect('figure')).toBe(1);
    expect(stageAspect('video')).toBe(1.6);
  });
});

describe('video', () => {
  it('only real ids make URLs', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', 'ur')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&hl=ur&cc_lang_pref=ur',
    );
    expect(youtubeEmbedUrl('x"><script>', 'en')).toBeNull();
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(youtubeWatchUrl(42)).toBeNull();
  });
  it('falls back to a visual block, never another video', () => {
    const blocks = [
      { type: 'scene', alt: { en: 's' } },
      { type: 'video', youtube_id: 'dQw4w9WgXcQ', offline_fallback_block: 0 },
      { type: 'video', youtube_id: 'dQw4w9WgXcQ', offline_fallback_block: 1 },
    ];
    expect(videoFallback(blocks, blocks[1] as never)?.type).toBe('scene');
    expect(videoFallback(blocks, blocks[2] as never)).toBeNull();
    expect(videoFallback(blocks, { type: 'video' })).toBeNull();
  });
});

describe('visualText', () => {
  it('figure: alt + numbered labels, fallback marked', () => {
    expect(
      visualText(
        fig({
          hotspots: [
            { x: 0, y: 0, label: { en: 'Nucleus', ur: 'مرکزہ' } },
            { label: { en: 'Wall' } },
          ],
        }) as never,
        'ur',
      ),
    ).toEqual([
      { kind: 'alt', text: 'خلیہ' },
      { kind: 'label', text: 'مرکزہ', n: 1 },
      { kind: 'label', text: 'Wall', n: 2, fallback: true },
    ]);
  });
  it('chart values, compare panels, scene captions, transcript', () => {
    expect(
      visualText(
        {
          type: 'chart',
          alt: { en: 'Distance' },
          x: { label: { en: 'time' }, unit: 's', values: [0, 1] },
          y: { unit: 'm' },
          series: [{ name: { en: 'car' }, values: [0, 5] }],
        },
        'en',
      ),
    ).toEqual([
      { kind: 'alt', text: 'Distance' },
      { kind: 'data', text: 'car: (time) 0 s: 0 m, 1 s: 5 m' },
    ]);
    const cmp = visualText(
      {
        type: 'compare',
        alt: { en: 'c' },
        left: { title: { en: 'Wrong' }, text: { en: '1/2+1/4=2/6' } },
        right: { title: { en: 'Right' } },
      },
      'en',
    );
    expect(cmp.map((l) => l.kind)).toEqual(['alt', 'title', 'text', 'title']);
    expect(visualText({ type: 'scene', steps: [{ caption: { en: 'go' } }] }, 'en')[0]).toEqual({
      kind: 'caption',
      text: 'go',
      n: 1,
    });
    expect(visualText({ type: 'video', transcript: { en: 'hi' } }, 'en')).toEqual([
      { kind: 'transcript', text: 'hi' },
    ]);
  });
});

describe('svg boxes', () => {
  it('aspect from viewBox, then width/height, else square', () => {
    expect(svgAspect('<svg viewBox="0 0 400 200">')).toBe(2);
    expect(svgAspect('<svg width="300px" height="100">')).toBe(3);
    expect(svgAspect('<svg>')).toBe(1);
  });
  it('fits and centres', () => {
    expect(fitBox(400, 400, 2)).toEqual({ width: 400, height: 200, left: 0, top: 100 });
    expect(fitBox(400, 100, 2)).toEqual({ width: 200, height: 100, left: 100, top: 0 });
    expect(fitBox(0, 100, 2).width).toBe(0);
  });
});
