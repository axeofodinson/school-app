// One question of a student's paper, answered in place. Types: mcq, true_false,
// numeric, short_text (typed), tap_image (big picture tiles + read-aloud). Any
// other type says it can't be answered here yet and is recorded as blank.
// A paper of only tap_image questions uses the paged pre-reader instead
// (features/prereader); a mixed paper shows tap_image here with the same read-aloud.
import {
  isAnswerable,
  promptText,
  questionLabel,
  tapChoices,
  type AnswerValue,
  type AttemptQuestion,
  type TapChoice,
} from '@school/core';
import { Image, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Card, IconButton, Text, TextField, useTheme } from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { radiusFor, space } from '../../ui/tokens';
import { canReadAloud, readAloud } from '../prereader/readAloud';

/** Picture tiles: a big target for small fingers. */
const TAP_TILE_MIN = 120;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A single-choice answer: a sticker that fills in when picked. */
function Choice({
  label,
  selected,
  onPress,
  disabled,
  children,
  style,
  minHeight,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: object;
  /** Taller face (picture tiles); the sticker shadow follows the face. */
  minHeight?: number;
}) {
  const { colours, p, presentation } = useTheme();
  return (
    <PressableSticker
      onPress={onPress}
      disabled={disabled}
      radius={radiusFor('md', presentation)}
      depth="stickerSm"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      style={style}
      faceStyle={() => [
        styles.choice,
        {
          minHeight: Math.max(minHeight ?? 0, p.controlHeight),
          backgroundColor: selected ? colours.primarySoft : colours.surface,
        },
        selected ? { borderColor: colours.primary } : null,
      ]}
    >
      {children ?? (
        <Text variant="label" tone={selected ? 'onPrimarySoft' : 'text'}>
          {label}
        </Text>
      )}
    </PressableSticker>
  );
}

function TapTile({ c, index }: { c: TapChoice; index: number }) {
  const { t } = useI18n();
  if (c.kind === 'emoji') {
    return (
      <Text variant="display" style={styles.emoji} accessible={false}>
        {Array.from({ length: c.count }, () => c.emoji).join('')}
      </Text>
    );
  }
  if (c.kind === 'image' && /^https:\/\//.test(c.image)) {
    return <Image source={{ uri: c.image }} style={styles.image} resizeMode="contain" />;
  }
  return (
    <Text variant="title">
      {c.label ?? t('student.prereader.choiceFallback', { number: index + 1 })}
    </Text>
  );
}

export function QuestionCard({
  index,
  question,
  value,
  onChange,
  disabled,
}: {
  index: number;
  question: AttemptQuestion;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const body = isObj(question.body) ? question.body : {};
  const tap = question.type === 'tap_image';
  const stem = tap
    ? (promptText(body, locale) ?? t('student.prereader.tapFallback'))
    : questionLabel(body, locale);
  const fieldLabel = t('student.attempt.questionNumber', { number: index + 1 });

  let input: React.ReactNode;
  if (!isAnswerable(question.type)) {
    input = (
      <Text tone="textMuted" variant="bodySm">
        {t('student.attempt.unsupported')}
      </Text>
    );
  } else if (question.type === 'mcq') {
    const options = Array.isArray(body.options) ? body.options.filter(isObj) : [];
    input = (
      <View accessibilityRole="radiogroup" style={styles.stack}>
        {options.map((o) => {
          const key = String(o.key ?? '');
          return (
            <Choice
              key={key}
              label={`${key}. ${String(o.text ?? '')}`}
              selected={value === key}
              onPress={() => onChange(key)}
              disabled={disabled}
            />
          );
        })}
      </View>
    );
  } else if (question.type === 'true_false') {
    input = (
      <View accessibilityRole="radiogroup" style={styles.row}>
        <Choice
          label={t('student.attempt.true')}
          selected={value === true}
          onPress={() => onChange(true)}
          disabled={disabled}
          style={styles.flex}
        />
        <Choice
          label={t('student.attempt.false')}
          selected={value === false}
          onPress={() => onChange(false)}
          disabled={disabled}
          style={styles.flex}
        />
      </View>
    );
  } else if (question.type === 'numeric' || question.type === 'short_text') {
    input = (
      <TextField
        label={t('student.attempt.yourAnswer')}
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        placeholder={t('student.attempt.numericPlaceholder')}
        keyboardType={question.type === 'numeric' ? 'numbers-and-punctuation' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
    );
  } else {
    const choices = tapChoices(body, locale);
    input = (
      <View accessibilityRole="radiogroup" style={styles.tapGrid}>
        {choices.map((c, i) => (
          <Choice
            key={c.id}
            label={c.label ?? t('student.prereader.choiceFallback', { number: i + 1 })}
            selected={value === c.id}
            onPress={() => onChange(c.id)}
            disabled={disabled}
            style={styles.tapCell}
            minHeight={TAP_TILE_MIN}
          >
            <TapTile c={c} index={i} />
          </Choice>
        ))}
      </View>
    );
  }

  return (
    <Card>
      <View style={styles.head}>
        <Text variant="label" tone="textMuted" style={styles.flex}>
          {fieldLabel} · {t('student.attempt.marks', { count: question.marks })}
        </Text>
        {tap && canReadAloud(body, locale) ? (
          <IconButton
            icon="speaker"
            label={t('student.prereader.listen')}
            variant="secondary"
            onPress={() => {
              readAloud(body, locale).catch(() => undefined);
            }}
          />
        ) : null}
      </View>
      <Text variant={tap ? 'title' : 'heading'} style={styles.stem}>
        {stem || '—'}
      </Text>
      {input}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stem: { marginVertical: space.md },
  stack: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  choice: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tapCell: { flexGrow: 1, flexBasis: 140 },
  emoji: { textAlign: 'center' },
  image: { width: 120, height: 96 },
});
