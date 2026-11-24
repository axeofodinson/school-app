// Draws a parsed Markdown worksheet (core parseMarkdown) with the app's Text, so
// Urdu gets Nastaliq + RTL like every other string. Links open only when they are
// http(s)/mailto; Urdu runs are never italicised (urduTextRules).
import { isSafeHref, parseMarkdown, type Span } from '@school/core';
import { useMemo } from 'react';
import { Linking, Platform, StyleSheet, View, Text as RNText } from 'react-native';

import { Text, useTheme } from '../../ui';
import { radius, scriptOf, space, textMetrics } from '../../ui/tokens';

const HEADING = ['title', 'heading', 'heading', 'label', 'label', 'label'] as const;

function Spans({ spans }: { spans: Span[] }) {
  const { colours, presentation } = useTheme();
  return (
    <>
      {spans.map((s, i) => {
        const urdu = scriptOf(s.text) === 'urdu';
        // Only http(s)/mailto links open (and look like links); others are plain text.
        const safe = Boolean(s.href) && isSafeHref(s.href);
        const style = [
          // Bundled fonts are one family per weight: pick the bold one (fontWeight alone
          // isn't drawn bold on Android).
          s.bold
            ? { fontFamily: textMetrics('label', urdu ? 'urdu' : 'latin', presentation).fontFamily }
            : null,
          s.italic && !urdu ? styles.italic : null,
          s.code ? [styles.code, { backgroundColor: colours.surfaceAlt }] : null,
          safe ? { color: colours.primary, textDecorationLine: 'underline' as const } : null,
        ];
        if (safe) {
          const href = s.href!;
          return (
            <RNText
              key={i}
              style={style}
              accessibilityRole="link"
              onPress={() => Linking.openURL(href).catch(() => undefined)}
            >
              {s.text}
            </RNText>
          );
        }
        return (
          <RNText key={i} style={style}>
            {s.text}
          </RNText>
        );
      })}
    </>
  );
}

export function MarkdownView({ source }: { source: string }) {
  const { colours } = useTheme();
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} variant={HEADING[b.level - 1] ?? 'label'} accessibilityRole="header">
                <Spans spans={b.spans} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i}>
                <Spans spans={b.spans} />
              </Text>
            );
          case 'quote':
            return (
              <View key={i} style={[styles.quote, { borderColor: colours.borderStrong }]}>
                <Text tone="textMuted">
                  <Spans spans={b.spans} />
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
                    <Text script="latin" tone="textMuted">
                      {b.ordered ? `${j + 1}.` : '•'}
                    </Text>
                    <Text style={styles.flex}>
                      <Spans spans={item} />
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

const mono = Platform.select({ android: 'monospace', default: 'monospace' });
const styles = StyleSheet.create({
  wrap: { gap: space.md },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: mono },
  mono: { fontFamily: mono },
  codeBlock: { padding: space.md, borderRadius: radius.md },
  quote: { borderStartWidth: 4, paddingStart: space.md },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
