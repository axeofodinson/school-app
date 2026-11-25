// `fraction_bars` widget: up to four bars of equal length. Cut a bar into more
// or fewer equal parts (− / +), tap a part to shade up to it. The readout says
// each fraction and how the first two compare ("1/2 = 2/4", worked exactly
// with integers). Kid presentation gets bigger parts. A part that becomes
// shaded fades in (`selectionChange`); a match pops the result chip
// (`answerCorrect`). Left-to-right in both languages, like the textbook.
import { sameFraction, simplify, type WidgetSpec } from '@school/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../../i18n';
import { Icon, IconButton, Text, useCues, useTheme } from '../../../ui';
import { useEnterStyle } from '../../../ui/motion';
import { useFocusRing } from '../../../ui/Sticker';
import { colours as palette, diagram, radius, space } from '../../../ui/tokens';

type Spec = Extract<WidgetSpec, { widget: 'fraction_bars' }>;
const FILLS = [diagram.focus, diagram.highlight, diagram.result, '#FF9E8A'];
const ON_FILL = ['#FFFFFF', diagram.ink, '#FFFFFF', diagram.ink];

function Part({
  on,
  fill,
  fg,
  label,
  showLabel,
  onPress,
  height,
  last,
}: {
  on: boolean;
  fill: string;
  fg: string;
  label: string;
  showLabel: boolean;
  onPress: () => void;
  height: number;
  last: boolean;
}) {
  const shade = useEnterStyle('selectionChange', on);
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={[styles.part, { height, borderEndWidth: last ? 0 : 2 }, ring]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill }, shade]} />
      {showLabel ? (
        <Text variant="label" script="latin" style={{ color: on ? fg : diagram.guide }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function FractionBars({ spec }: { spec: Spec }) {
  const { t } = useI18n();
  const { presentation } = useTheme();
  const { cue } = useCues();
  const [bars, setBars] = useState(spec.bars);
  const kid = presentation === 'kid';
  const h = kid ? 52 : 42;

  const set = (i: number, den: number, shaded: number) => {
    const next = bars.map((b, k) => (k === i ? { den, shaded: Math.min(shaded, den) } : b));
    setBars(next);
    const [a, b] = next;
    if (a && b && a.shaded > 0 && sameFraction(a.shaded, a.den, b.shaded, b.den)) cue('ding');
  };

  const [a, b] = bars;
  const both = a && b && a.shaded > 0 && b.shaded > 0;
  const equal = both ? sameFraction(a.shaded, a.den, b.shaded, b.den) : false;
  const sign = both ? (equal ? '=' : a.shaded * b.den > b.shaded * a.den ? '>' : '<') : null;
  const pop = useEnterStyle('answerCorrect', equal, { scaleFrom: 0.9 });

  return (
    <View style={styles.root}>
      {bars.map((bar, i) => {
        const [sn, sd] = simplify(bar.shaded, bar.den);
        return (
          <View key={i} style={styles.barRow}>
            <IconButton
              icon="arrowDown"
              label={t('student.learn.widget.fewerParts')}
              variant="secondary"
              disabled={bar.den <= 1}
              onPress={() => set(i, bar.den - 1, bar.shaded)}
            />
            <View style={[styles.bar, { borderColor: diagram.ink }]}>
              {Array.from({ length: bar.den }, (_, k) => (
                <Part
                  key={`${bar.den}-${k}`}
                  on={k < bar.shaded}
                  fill={FILLS[i % FILLS.length]!}
                  fg={ON_FILL[i % ON_FILL.length]!}
                  label={`1/${bar.den}`}
                  showLabel={bar.den <= (kid ? 6 : 10)}
                  height={h}
                  last={k === bar.den - 1}
                  onPress={() => set(i, bar.den, bar.shaded === k + 1 ? k : k + 1)}
                />
              ))}
            </View>
            <IconButton
              icon="arrowUp"
              label={t('student.learn.widget.moreParts')}
              variant="secondary"
              disabled={bar.den >= spec.maxDen}
              onPress={() => set(i, bar.den + 1, bar.shaded)}
            />
            <View style={styles.value} accessibilityLiveRegion="polite">
              <Text variant="heading" script="latin" style={{ color: diagram.ink }}>
                {`${bar.shaded}/${bar.den}`}
              </Text>
              {bar.shaded > 0 && sd !== bar.den ? (
                <Text variant="caption" script="latin" style={{ color: diagram.guide }}>
                  {`= ${sn}/${sd}`}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {sign && a && b ? (
        <Animated.View
          style={[
            styles.result,
            {
              backgroundColor: equal ? palette.light.correctSoft : palette.light.surface,
              borderColor: equal ? diagram.result : diagram.ink,
            },
            equal ? pop : null,
          ]}
          accessibilityLiveRegion="polite"
        >
          {equal ? <Icon name="check" size={18} colour={diagram.result} /> : null}
          <Text
            variant="heading"
            script="latin"
            style={{ color: equal ? palette.light.onCorrectSoft : diagram.ink }}
          >
            {`${a.shaded}/${a.den} ${sign} ${b.shaded}/${b.den}`}
          </Text>
          <Text
            variant="bodySm"
            style={{ color: equal ? palette.light.onCorrectSoft : diagram.guide }}
          >
            {t(equal ? 'student.learn.widget.same' : 'student.learn.widget.notSame')}
          </Text>
        </Animated.View>
      ) : (
        <Text variant="bodySm" style={[styles.hint, { color: diagram.guide }]}>
          {t('student.learn.widget.tapParts')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: space.md, padding: space.md, direction: 'ltr' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bar: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 2,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  part: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: diagram.ink,
  },
  value: { minWidth: 56, alignItems: 'center' },
  result: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 2,
  },
  hint: { textAlign: 'center' },
});
