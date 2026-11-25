// A quick check after a lesson section (DESIGN_SYSTEM.md §7b.1 "Pedagogy"): one
// practice item, answered and checked on the device (the version a student can
// read is approved for practice, so its key is meant for instant feedback).
// Right → tick pops in (`answerCorrect`); wrong → clay tint (`answerWrong`, no
// shake) and the why-wrong panel rises (`whyWrongReveal`); then Try again.
// Not recorded: practice attempts and mastery arrive with prompts 31/40.
import { autoMarkItem, pickLang, type LessonBlock, type LessonLang } from '@school/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { Button, Icon, Text, TextField, useCues, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { PressableSticker } from '../../ui/Sticker';
import { radius, radiusFor, space } from '../../ui/tokens';
import type { QuickItem } from './api';
import { LessonText } from './LessonText';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function Option({
  letter,
  text,
  selected,
  state,
  onPress,
  disabled,
}: {
  letter: string;
  text: string;
  selected: boolean;
  state: 'right' | 'wrong' | null;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colours, p, presentation } = useTheme();
  const bg =
    state === 'right'
      ? colours.correctSoft
      : state === 'wrong'
        ? colours.wrongSoft
        : selected
          ? colours.primarySoft
          : colours.surface;
  const key =
    state === 'right'
      ? colours.correct
      : state === 'wrong'
        ? colours.wrong
        : selected
          ? colours.primary
          : colours.surfaceAlt;
  const fg = state || selected ? 'onPrimary' : 'text';
  return (
    <PressableSticker
      onPress={onPress}
      disabled={disabled}
      radius={radiusFor('md', presentation)}
      depth="stickerSm"
      accessibilityRole="radio"
      accessibilityLabel={`${letter}. ${text}`}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      faceStyle={() => [styles.option, { minHeight: p.controlHeight, backgroundColor: bg }]}
    >
      <View style={[styles.letter, { backgroundColor: key }]}>
        {state ? (
          <Icon name={state === 'right' ? 'check' : 'close'} size={18} tone="onPrimary" />
        ) : (
          <Text variant="label" tone={fg} script="latin">
            {letter}
          </Text>
        )}
      </View>
      <View style={styles.flex}>
        <LessonText source={text} variant="label" />
      </View>
    </PressableSticker>
  );
}

export function QuickCheck({
  item,
  block,
  lang,
}: {
  item: QuickItem | null;
  block: LessonBlock;
  lang: LessonLang;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const { cue } = useCues();
  const [value, setValue] = useState<string | boolean | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const tick = useEnterStyle('answerCorrect', result === true, { scaleFrom: 0.9 });
  const tint = useEnterStyle('answerWrong', result === false);
  const why = useEnterStyle('whyWrongReveal', result !== null, { translateY: 12 });

  const own = pickLang({ en: block.en, ur: block.ur }, lang)?.text ?? '';
  const head = (
    <View style={styles.head}>
      <View style={[styles.badge, { backgroundColor: colours.accent }]}>
        <Icon name="lightbulb" size={18} colour={colours.onAccent} />
      </View>
      <Text variant="label" tone="textMuted">
        {t('student.learn.quickCheck')}
      </Text>
    </View>
  );

  // No readable item: the block's own text is a question to think about.
  if (!item) {
    return (
      <View
        style={[styles.card, { backgroundColor: colours.accentSoft, borderColor: colours.accent }]}
      >
        {head}
        {own ? (
          <LessonText source={own} />
        ) : (
          <Text tone="textMuted">{t('student.learn.checkSoon')}</Text>
        )}
      </View>
    );
  }

  const body = isObj(item.body) ? item.body : {};
  const stem = pickLang(body.stem, lang)?.text ?? own;
  const options = (Array.isArray(body.options) ? body.options : []).filter(isObj).map((o, i) => ({
    key: typeof o.key === 'string' ? o.key : String.fromCharCode(65 + i),
    text: pickLang(o.text, lang)?.text ?? '',
  }));
  const correctKey = isObj(item.answer) ? item.answer.correct : undefined;
  const explanation = isObj(item.explanation) ? item.explanation : {};
  const whyWrong =
    result === false && typeof value === 'string' && isObj(explanation.why_wrong)
      ? pickLang((explanation.why_wrong as Obj)[value], lang)?.text
      : null;
  const explain = whyWrong ?? pickLang(explanation, lang)?.text ?? null;

  const check = () => {
    if (value === null || value === '') return;
    const ok = autoMarkItem(item.type, value, item.answer) === true;
    setResult(ok);
    cue(ok ? 'ding' : 'pop');
  };
  const retry = () => {
    setResult(null);
    setValue(null);
  };
  const locked = result !== null;
  const stateOf = (k: string | boolean) =>
    !locked ? null : k === correctKey && result ? 'right' : k === value && !result ? 'wrong' : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colours.surface, borderColor: colours.borderStrong }]}
    >
      {/* The wrong-answer tint fades in behind the card (opacity only). */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: colours.wrongSoft }, tint]}
      />
      {head}
      <LessonText source={stem} variant="heading" />
      <View style={styles.options} accessibilityRole="radiogroup">
        {item.type === 'mcq'
          ? options.map((o) => (
              <Option
                key={o.key}
                letter={o.key}
                text={o.text}
                selected={value === o.key}
                state={stateOf(o.key)}
                disabled={locked}
                onPress={() => setValue(o.key)}
              />
            ))
          : null}
        {item.type === 'true_false'
          ? ([true, false] as const).map((v) => (
              <Option
                key={String(v)}
                letter={v ? '✓' : '✗'}
                text={t(v ? 'student.learn.true' : 'student.learn.false')}
                selected={value === v}
                state={stateOf(v)}
                disabled={locked}
                onPress={() => setValue(v)}
              />
            ))
          : null}
        {item.type === 'numeric' || item.type === 'short_text' ? (
          <TextField
            label={t('student.learn.yourAnswer')}
            value={typeof value === 'string' ? value : ''}
            onChangeText={setValue}
            editable={!locked}
            keyboardType={item.type === 'numeric' ? 'decimal-pad' : 'default'}
            script={item.type === 'numeric' ? 'latin' : undefined}
            onSubmitEditing={check}
          />
        ) : null}
      </View>
      {locked ? (
        <Animated.View
          style={[
            styles.feedback,
            { backgroundColor: result ? colours.correctSoft : colours.surfaceAlt },
            why,
          ]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.head}>
            <Animated.View
              style={[
                styles.mark,
                { backgroundColor: result ? colours.correct : colours.wrong },
                result ? tick : null,
              ]}
            >
              <Icon name={result ? 'check' : 'info'} size={18} tone="onPrimary" />
            </Animated.View>
            <Text variant="heading" tone={result ? 'onCorrectSoft' : 'text'}>
              {t(result ? 'student.learn.right' : 'student.learn.notQuite')}
            </Text>
          </View>
          {explain ? <LessonText source={explain} /> : null}
          {result ? null : (
            <Button
              title={t('student.learn.tryAgain')}
              variant="secondary"
              icon="replay"
              onPress={retry}
            />
          )}
        </Animated.View>
      ) : (
        <Button
          title={t('student.learn.check')}
          onPress={check}
          disabled={value === null || value === ''}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tint: { borderRadius: radius.lg - 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  options: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  letter: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  feedback: { gap: space.sm, padding: space.md, borderRadius: radius.md },
});
