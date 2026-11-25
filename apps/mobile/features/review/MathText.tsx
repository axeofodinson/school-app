// Stored question text with its pre-rendered maths (db/031 math_svgs): plain
// runs as Text, each `$…$` as its SVG at text size. A missing rendering shows
// the TeX itself, so nothing is hidden from the reviewer. No runtime TeX.
import { mathSvgSizeEx, splitMath, type MathPart } from '@school/core';
import { createContext, useContext, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Text, useTheme, type AppTextProps } from '../../ui';

/** Rendered maths by key, loaded once per queue page. */
export const MathContext = createContext<ReadonlyMap<string, string>>(new Map());

// MathJax sizes are in ex; at body size one ex is about 8 px.
const EX_PX = 8.2;

export function MathText({
  text,
  variant = 'body',
  tone = 'text',
}: {
  text: string;
  variant?: AppTextProps['variant'];
  tone?: AppTextProps['tone'];
}) {
  const parts = useMemo(() => splitMath(text), [text]);
  const svgs = useContext(MathContext);
  const { colours } = useTheme();
  if (!parts.some((p) => p.kind === 'math')) {
    return (
      <Text variant={variant} tone={tone}>
        {text}
      </Text>
    );
  }
  // Words wrap one by one around the maths pictures.
  type Piece = MathPart | { kind: 'word'; text: string };
  const pieces = parts.flatMap((p): Piece[] =>
    p.kind === 'text'
      ? p.text
          .split(/(\s+)/)
          .filter((w) => w.trim())
          .map((w) => ({ kind: 'word', text: w }))
      : [p],
  );
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={text}>
      {pieces.map((p, i) => {
        if (p.kind === 'word') {
          return (
            <Text key={i} variant={variant} tone={tone}>
              {p.text}
            </Text>
          );
        }
        if (p.kind !== 'math') return null;
        const svg = svgs.get(p.key);
        if (!svg) {
          return (
            <Text key={i} variant={variant} tone="textMuted" script="latin">
              {p.tex}
            </Text>
          );
        }
        const s = mathSvgSizeEx(svg);
        return (
          <View key={i} style={p.display ? styles.display : undefined}>
            <SvgXml
              xml={svg}
              width={s.width * EX_PX}
              height={s.height * EX_PX}
              color={colours[tone]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5, rowGap: 2 },
  display: { width: '100%', alignItems: 'center', paddingVertical: 4 },
});
