// `widget` block host (DESIGN_SYSTEM.md §7b.1): picks the catalogue widget and
// hands it the checked params. Lessons only pass settings; adding a widget is a
// small code change here. A widget not built yet (or broken params) shows its
// text version, so nothing the lesson says is lost. Widgets never appear in
// exam items (the importer refuses them; exam mode shows the text version).
import { BUILT_WIDGETS, parseWidget, type LessonBlock, type LessonLang } from '@school/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../../i18n';
import { Button, Icon, Text } from '../../../ui';
import { useEnterStyle, useExiting, useMotion } from '../../../ui/motion';
import { colours as palette, diagram, radius, space } from '../../../ui/tokens';
import { useVisualSession } from '../visualState';
import { LaterVisual } from '../visuals';
import { FractionBars } from './FractionBars';
import { FunctionGraph } from './FunctionGraph';
import { MotionGraph } from './MotionGraph';
import { NumberLine } from './NumberLine';

export function WidgetHost({
  block,
  lang,
  predictReady = false,
}: {
  block: LessonBlock;
  lang: LessonLang;
  predictReady?: boolean;
}) {
  const { t } = useI18n();
  const { inExam } = useMotion();
  const s = useVisualSession();
  const w = useMemo(() => parseWidget(block), [block]);
  const waiting = predictReady && !s.predicted;
  const veil = useEnterStyle('predictReveal', waiting);
  const veilOut = useExiting('predictReveal');

  if (inExam || !w || !w.spec) {
    const built = Boolean(w && (BUILT_WIDGETS as readonly string[]).includes(w.widget));
    return <LaterVisual block={block} lang={lang} broken={built || !w} />;
  }
  const spec = w.spec;
  let body: React.ReactNode = null;
  switch (spec.widget) {
    case 'function_graph':
      body = (
        <FunctionGraph
          spec={spec}
          source={String((block.params as { expr?: string })?.expr ?? '')}
        />
      );
      break;
    case 'fraction_bars':
      body = <FractionBars spec={spec} />;
      break;
    case 'number_line':
      body = <NumberLine spec={spec} />;
      break;
    case 'motion_graph':
      body = <MotionGraph spec={spec} playToken={s.playToken} />;
      break;
  }
  return (
    <View style={styles.fill}>
      {body}
      {waiting ? (
        <Animated.View exiting={veilOut} style={[styles.veil, veil]}>
          <View style={styles.chip}>
            <Icon name="sparkles" size={18} colour={diagram.ink} />
            <Text variant="label" style={{ color: diagram.ink }}>
              {t('student.learn.predictFirst')}
            </Text>
          </View>
          <Button
            size="sm"
            variant="secondary"
            title={t('student.learn.justTry')}
            onPress={() => s.setPredicted(true)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: diagram.ink,
    backgroundColor: palette.light.accent,
  },
});
