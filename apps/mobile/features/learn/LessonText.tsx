// Lesson text: the worksheet Markdown subset plus `$…$` maths drawn from the
// SVG the importer pre-rendered once (db/031 `math_svgs`; CLAUDE.md: no runtime
// KaTeX). Maths without a stored SVG shows its TeX, so nothing is ever lost.
// Urdu runs get Nastaliq + RTL through the app's Text, like every other string.
import { isSafeHref, mathBox, parseLessonText, type LessonSpan } from '@school/core';
import { createContext, useContext, useMemo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View, Text as RNText } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text, useTheme, type AppTextProps } from '../../ui';
import { radius, scriptOf, space, textMetrics, type TypeStep } from '../../ui/tokens';

/** Key → pre-rendered SVG for the lesson being read. */
export const MathContext = createContext<Record<string, string>>({});

const HEADING = ['title', 'heading', 'heading', 'label', 'label', 'label'] as const;
const mono = Platform.select({ android: 'monospace', default: 'monospace' });

function MathSpan({
  span,
  variant,
  colour,
}: {
  span: LessonSpan;
  variant: TypeStep;
  colour: string;
}) {
  const svgs = useContext(MathContext);
  const { presentation, colours } = useTheme();
  const m = span.math!;
  const svg = svgs[m.key];
  const fontSize = textMetrics(variant, 'latin', presentation).fontSize;
  if (!svg) {
    return (
      <RNText
        style={[styles.tex, { backgroundColor: colours.surfaceAlt, color: colour }]}
        accessibilityLabel={m.tex}
      >
        {m.tex}
      </RNText>
    );
  }
  const box = mathBox(svg, m.display ? fontSize * 1.15 : fontSize);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={m.tex}
      style={{
        width: box.width,
        height: box.height,
        // MathJax's vertical-align (usually below the baseline) as a transform.
        transform: [{ translateY: -box.baselineShift / 2 }],
      }}
    >
      <SvgXml xml={svg} width={box.width} height={box.height} color={colour} />
    </View>
  );
}

function Spans({
  spans,
  variant,
  colour,
}: {
  spans: LessonSpan[];
  variant: TypeStep;
  colour: string;
}) {
  const { colours, presentation } = useTheme();
  return (
    <>
      {spans.map((s, i) => {
        if (s.math) return <MathSpan key={i} span={s} variant={variant} colour={colour} />;
        const urdu = scriptOf(s.text) === 'urdu';
        const safe = Boolean(s.href) && isSafeHref(s.href);
        const style = [
          s.bold
            ? { fontFamily: textMetrics('label', urdu ? 'urdu' : 'latin', presentation).fontFamily }
            : null,
          s.italic && !urdu ? styles.italic : null,
          s.code ? [styles.code, { backgroundColor: colours.surfaceAlt }] : null,
          safe ? { color: colours.primary, textDecorationLine: 'underline' as const } : null,
        ];
        return (
          <RNText
            key={i}
            style={style}
            accessibilityRole={safe ? 'link' : undefined}
            onPress={safe ? () => Linking.openURL(s.href!).catch(() => undefined) : undefined}
          >
            {s.text}
          </RNText>
        );
      })}
    </>
  );
}

/** One display equation on its own line: centred, scrolls sideways if it's wide. */
function DisplayMath({ span, colour }: { span: LessonSpan; colour: string }) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.display}
      showsHorizontalScrollIndicator={false}
    >
      <MathSpan span={span} variant="heading" colour={colour} />
    </ScrollView>
  );
}

export function LessonText({
  source,
  variant = 'body',
  tone = 'text',
  style,
  numberOfLines,
}: {
  source: string;
  variant?: TypeStep;
  tone?: AppTextProps['tone'];
  style?: AppTextProps['style'];
  numberOfLines?: number;
}) {
  const { colours } = useTheme();
  const colour = colours[tone ?? 'text'];
  const blocks = useMemo(() => parseLessonText(source), [source]);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text
                key={i}
                variant={HEADING[b.level - 1] ?? 'label'}
                tone={tone}
                accessibilityRole="header"
              >
                <Spans spans={b.spans} variant={HEADING[b.level - 1] ?? 'label'} colour={colour} />
              </Text>
            );
          case 'paragraph': {
            const only = b.spans.length === 1 ? b.spans[0]! : null;
            if (only?.math?.display) return <DisplayMath key={i} span={only} colour={colour} />;
            return (
              <Text
                key={i}
                variant={variant}
                tone={tone}
                style={style}
                numberOfLines={numberOfLines}
              >
                <Spans spans={b.spans} variant={variant} colour={colour} />
              </Text>
            );
          }
          case 'quote':
            return (
              <View key={i} style={[styles.quote, { borderColor: colours.borderStrong }]}>
                <Text variant={variant} tone="textMuted">
                  <Spans spans={b.spans} variant={variant} colour={colours.textMuted} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View key={i} style={[styles.codeBlock, { backgroundColor: colours.surfaceAlt }]}>
                <Text script="latin" style={styles.mono}>
                  {b.text}
                </Text>
              </View>
            );
          case 'list':
            return (
              <View key={i} style={styles.list}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.item}>
                    <Text variant={variant} script="latin" tone="textMuted">
                      {b.ordered ? `${j + 1}.` : '•'}
                    </Text>
                    <Text variant={variant} tone={tone} style={styles.flex}>
                      <Spans spans={item} variant={variant} colour={colour} />
                    </Text>
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: mono },
  mono: { fontFamily: mono },
  tex: { fontFamily: mono, borderRadius: radius.sm, paddingHorizontal: space.xxs },
  codeBlock: { padding: space.md, borderRadius: radius.md },
  quote: { borderStartWidth: 4, paddingStart: space.md },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  display: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xs },
});
