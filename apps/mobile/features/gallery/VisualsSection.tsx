// Gallery entries for the lesson visual blocks (prompt 33): the sample Class 9
// Physics scene, chart and widget (synthetic, `test_data`), plus one of each
// remaining chart kind and widget, on the stage they get in a lesson. The
// gallery's language / theme / presentation / motion tier / exam switches all
// apply. Exam mode shows scenes and widgets as their text version, as exams do.
import { stageAspect, type LessonBlock, type LessonLang } from '@school/core';
import sample from '@school/core/samples/class9-physics-motion.json';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Card, Text } from '../../ui';
import { Stage } from '../learn/Stage';
import { StageVisual } from '../learn/StageVisual';
import { space } from '../../ui/tokens';

const blocks = sample.lesson.blocks as unknown as LessonBlock[];
const find = (t: string) => blocks.find((b) => b.type === t)!;
const bi = (en: string, ur: string) => ({ en, ur });

// Demo-only blocks for the kinds the sample topic doesn't use (synthetic numbers).
const EXTRA: { title: string; aspect: number; block: LessonBlock }[] = [
  {
    title: 'chart · bar',
    aspect: 16 / 10,
    block: {
      type: 'chart',
      kind: 'bar',
      alt: bi(
        'TEST rainfall by month, July highest.',
        'TEST مہینہ وار بارش، جولائی میں سب سے زیادہ۔',
      ),
      x: { label: bi('Month', 'مہینہ'), values: ['May', 'Jun', 'Jul', 'Aug', 'Sep'] },
      y: { label: bi('Rain', 'بارش'), unit: 'mm' },
      series: [
        { name: bi('TEST city', 'TEST شہر'), values: [20, 45, 190, 160, 70], role: 'focus' },
      ],
    },
  },
  {
    title: 'chart · pie',
    aspect: 16 / 10,
    block: {
      type: 'chart',
      kind: 'pie',
      alt: bi('TEST how a class gets to school.', 'TEST بچے اسکول کیسے آتے ہیں۔'),
      x: { values: ['Walk', 'Bus', 'Bike', 'Car'] },
      series: [{ values: [14, 9, 5, 4] }],
    },
  },
  {
    title: 'widget · function_graph',
    aspect: 1,
    block: {
      type: 'widget',
      widget: 'function_graph',
      alt: bi(
        'Graph of y = mx + c with sliders for m and c.',
        'y = mx + c کا گراف، m اور c کے سلائیڈر کے ساتھ۔',
      ),
      params: { expr: 'm*x + c', sliders: { m: [-3, 3, 0.5, 1], c: [-5, 5, 1, 1] }, x: [-6, 6] },
      task: bi('Make the line go downhill.', 'لکیر کو نیچے کی طرف جھکاؤ۔'),
    },
  },
  {
    title: 'widget · fraction_bars',
    aspect: stageAspect('widget', 'fraction_bars'),
    block: {
      type: 'widget',
      widget: 'fraction_bars',
      alt: bi(
        'Two fraction bars to compare halves and quarters.',
        'آدھے اور چوتھائی کا موازنہ کرنے کے لیے دو پٹیاں۔',
      ),
      params: {
        bars: [
          { den: 2, shaded: 1 },
          { den: 4, shaded: 1 },
        ],
      },
    },
  },
  {
    title: 'widget · number_line',
    aspect: stageAspect('widget', 'number_line'),
    block: {
      type: 'widget',
      widget: 'number_line',
      alt: bi(
        'Number line from −5 to 10; start at 2 and jump 3.',
        '−5 سے 10 تک نمبر لائن؛ 2 سے شروع کرو اور 3 کی چھلانگ لگاؤ۔',
      ),
      params: { min: -5, max: 10, step: 1, start: 2, jump: 3, target: 8 },
    },
  },
];

function Entry({
  title,
  aspect,
  block,
  lang,
  sampleTopic = false,
}: {
  title: string;
  aspect: number;
  block: LessonBlock;
  lang: LessonLang;
  sampleTopic?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <Text variant="label" script="latin">
        {title}
      </Text>
      {sampleTopic ? (
        <Text variant="caption" tone="textMuted">
          {t('dev.gallery.sampleTopic')}
        </Text>
      ) : null}
      <Stage hue="sky" aspect={aspect} label={title}>
        <StageVisual block={block} lang={lang} showCaption />
      </Stage>
    </Card>
  );
}

export function VisualsSection() {
  const { t, locale } = useI18n();
  const lang: LessonLang = locale === 'ur' ? 'ur' : 'en';
  return (
    <View style={styles.section}>
      <Text variant="title" accessibilityRole="header">
        {t('dev.gallery.sections.visuals')}
      </Text>
      <Text tone="textMuted">{t('dev.gallery.visualsIntro')}</Text>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <Entry title="scene" sampleTopic aspect={16 / 10} block={find('scene')} lang={lang} />
        </View>
        <View style={styles.cell}>
          <Entry
            title="chart · line"
            sampleTopic
            aspect={16 / 10}
            block={find('chart')}
            lang={lang}
          />
        </View>
        <View style={styles.cell}>
          <Entry
            title="widget · motion_graph"
            sampleTopic
            aspect={1}
            block={find('widget')}
            lang={lang}
          />
        </View>
        {EXTRA.map((e) => (
          <View key={e.title} style={styles.cell}>
            <Entry {...e} lang={lang} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexGrow: 1, flexBasis: 520, maxWidth: 760 },
});
