// Markdown renderer — draws a parsed .md document with the app's own text
// primitives, so a markdown file assessment shows FORMATTED, not as raw text
// (Part 2 acceptance). No heavy markdown dependency (CLAUDE.md): the parser is the
// small vendored src/markdown/parse.js, pinned by `npm run verify:markdown`.
//
// Bilingual + RTL come for free: every line renders through the themed <Text>,
// which sets the Nastaliq font and rtl writing direction for Urdu. List markers
// and inline emphasis live INSIDE the Text so they flow with the reading
// direction rather than pinning to the left.
import { View, Text as RNText, StyleSheet, Linking, Platform } from 'react-native';

import Text from './Text';
import { colors, spacing } from '../theme/colors';
import { localeFont } from '../theme/fonts';

// A monospace-ish family for inline/code blocks, per platform.
const CODE_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

// Heading font size by level (h1 biggest). Bold weight comes from the font family.
const HEADING_SIZE = { 1: 22, 2: 19, 3: 17, 4: 16, 5: 15, 6: 14 };

// Render inline spans as nested RNText inside a themed <Text>. Each span overrides
// only what it needs (bold family, italic, code family, link colour); everything
// else — size, colour, direction — is inherited from the parent Text.
function Spans({ spans }) {
  return spans.map((s, i) => {
    const style = {};
    if (s.bold) {
      // Urdu bolds via the Nastaliq-Bold family; English (system font) via weight.
      style.fontFamily = localeFont('bold');
      style.fontWeight = '700';
    }
    if (s.italic) style.fontStyle = 'italic';
    if (s.code) {
      style.fontFamily = CODE_FONT;
      style.color = colors.primary;
    }
    if (s.href) {
      style.color = colors.primary;
      style.textDecorationLine = 'underline';
    }
    const onPress = s.href
      ? () => {
          Linking.openURL(s.href).catch(() => {});
        }
      : undefined;
    return (
      <RNText key={i} style={style} onPress={onPress}>
        {s.text}
      </RNText>
    );
  });
}

// Render one parsed block.
function Block({ block }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text
          color={colors.text}
          style={[
            styles.heading,
            {
              fontSize: HEADING_SIZE[block.level] ?? 14,
              fontFamily: localeFont('bold'),
              fontWeight: '700',
            },
          ]}
        >
          <Spans spans={block.spans} />
        </Text>
      );
    case 'quote':
      return (
        <View style={styles.quote}>
          <Text variant="body" color={colors.muted}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={styles.codeBlock}>
          <RNText style={styles.codeText}>{block.text}</RNText>
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <Text key={i} variant="body" style={styles.listItem}>
              <RNText>{block.ordered ? `${i + 1}. ` : '•  '}</RNText>
              <Spans spans={item} />
            </Text>
          ))}
        </View>
      );
    case 'paragraph':
    default:
      return (
        <Text variant="body" style={styles.paragraph}>
          <Spans spans={block.spans} />
        </Text>
      );
  }
}

// Render a list of parsed markdown blocks (from parseMarkdown).
export default function Markdown({ blocks }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return (
    <View>
      {blocks.map((block, i) => (
        <View key={i} style={i > 0 ? styles.blockGap : null}>
          <Block block={block} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blockGap: { marginTop: spacing.md },
  heading: { marginBottom: spacing.xs },
  paragraph: {},
  quote: {
    borderStartWidth: 3,
    borderStartColor: colors.border,
    paddingStart: spacing.md,
  },
  codeBlock: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  codeText: { fontFamily: CODE_FONT, color: colors.text, fontSize: 14 },
  list: {},
  listItem: { marginTop: spacing.xs },
});
