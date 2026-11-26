// One practice question (DESIGN_SYSTEM §7.4): stem, big options, flag, tip, Check.
// After Check the feedback panel rises (`whyWrongReveal`, no layout jump): right →
// tick pops in (`answerCorrect`); wrong → clay tint fades in behind the card
// (`answerWrong`, never a shake), the chosen option says why it is wrong and the
// right one says why it is right. Question switch has no motion (< 150 ms budget):
// the parent keys this view by question, so content swaps and the panel restarts.
// Options stay at full strength after Check (presses are ignored, not greyed), so
// the right/wrong marks read clearly.
import { hasAnswer, pickLang, type LessonLang } from '@school/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { Badge, Button, Icon, IconButton, Text, TextField, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { radius, space } from '../../ui/tokens';
import { LessonText } from '../learn/LessonText';
import { Option } from '../learn/QuickCheck';
import type { PracticeQuestion } from './api';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export type Value = string | boolean | null;

/** What the card shows, read from the question's jsonb once. */
export function readQuestion(q: PracticeQuestion, lang: LessonLang) {
  const body = isObj(q.body) ? q.body : {};
  const stem = pickLang(body.stem, lang)?.text ?? '';
  const options = (Array.isArray(body.options) ? body.options : []).filter(isObj).map((o, i) => ({
    key: typeof o.key === 'string' ? o.key : String.fromCharCode(65 + i),
    text: pickLang(o.text, lang)?.text ?? '',
  }));
  const answer = isObj(q.answer) ? q.answer : {};
  const correct = answer.correct as string | boolean | number | undefined;
  const explanation = isObj(q.explanation) ? q.explanation : {};
  const why = pickLang(explanation, lang)?.text ?? null;
  const whyWrong = (k: Value) =>
    typeof k === 'string' && isObj(explanation.why_wrong)
      ? (pickLang((explanation.why_wrong as Obj)[k], lang)?.text ?? null)
      : null;
  const hint = pickLang(body.hint, lang)?.text ?? null;
  return { stem, options, correct, why, whyWrong, hint };
}

export function QuestionView({
  q,
  lang,
  conceptTitle,
  value,
  onChange,
  result,
  onCheck,
  onNext,
  isLast,
  flagged,
  onFlag,
  tipOpen,
  onTip,
  onLesson,
}: {
  q: PracticeQuestion;
  lang: LessonLang;
  conceptTitle: string | null;
  value: Value;
  onChange: (v: Value) => void;
  /** null until checked. */
  result: boolean | null;
  onCheck: () => void;
  onNext: () => void;
  isLast: boolean;
  flagged: boolean;
  onFlag: () => void;
  tipOpen: boolean;
  onTip: () => void;
  onLesson: (() => void) | null;
}) {
  const { t } = useI18n();
  const { colours, presentation } = useTheme();
  const view = readQuestion(q, lang);
  const locked = result !== null;
  const tick = useEnterStyle('answerCorrect', result === true, { scaleFrom: 0.9 });
  const tint = useEnterStyle('answerWrong', result === false);
  const panel = useEnterStyle('whyWrongReveal', locked, { translateY: 12 });
  const tip = useEnterStyle('whyWrongReveal', tipOpen, { translateY: 8 });
  const [focusText] = useState(() => q.type === 'numeric' || q.type === 'short_text');

  const stateOf = (k: string | boolean) =>
    !locked ? null : k === view.correct ? 'right' : k === value ? 'wrong' : null;

  const correctText =
    q.type === 'mcq'
      ? (() => {
          const o = view.options.find((x) => x.key === view.correct);
          return o ? `${o.key}. ${o.text}` : null;
        })()
      : q.type === 'true_false'
        ? t(view.correct ? 'student.learn.true' : 'student.learn.false')
        : view.correct !== undefined
          ? String(view.correct)
          : null;
  const whyWrong = result === false ? view.whyWrong(value) : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colours.surface, borderColor: colours.borderStrong }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: colours.wrongSoft }, tint]}
      />
      <View style={styles.topRow}>
        {conceptTitle ? (
          <Badge label={conceptTitle} tone="neutral" icon="layers" style={styles.flexShrink} />
        ) : (
          <View style={styles.flex} />
        )}
        <View style={styles.flex} />
        <IconButton
          icon="lightbulb"
          label={t(tipOpen ? 'student.practice.tipHide' : 'student.practice.tip')}
          selected={tipOpen}
          onPress={onTip}
        />
        <IconButton
          icon="flag"
          label={t(flagged ? 'student.practice.unflag' : 'student.practice.flag')}
          selected={flagged}
          onPress={onFlag}
        />
      </View>

      {tipOpen ? (
        <Animated.View
          style={[
            styles.tipBox,
            { backgroundColor: colours.accentSoft, borderColor: colours.accent },
            tip,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Icon name="lightbulb" size={20} colour={colours.accent} />
          <View style={styles.flex}>
            {view.hint ? (
              <LessonText source={view.hint} />
            ) : (
              <>
                {conceptTitle ? (
                  <Text variant="label">
                    {t('student.practice.tipConcept', { concept: conceptTitle })}
                  </Text>
                ) : null}
                <Text>{t(`student.practice.tips.${q.type as 'mcq'}`)}</Text>
              </>
            )}
          </View>
        </Animated.View>
      ) : null}

      <LessonText source={view.stem} variant="heading" />
      {flagged ? (
        <Text variant="bodySm" tone="textMuted">
          {t('student.practice.flagged')}
        </Text>
      ) : null}

      <View style={styles.options} accessibilityRole="radiogroup">
        {q.type === 'mcq'
          ? view.options.map((o) => (
              <Option
                key={o.key}
                letter={o.key}
                text={o.text}
                selected={value === o.key}
                state={stateOf(o.key)}
                disabled={false}
                onPress={() => !locked && onChange(o.key)}
              />
            ))
          : null}
        {q.type === 'true_false'
          ? ([true, false] as const).map((v) => (
              <Option
                key={String(v)}
                letter={v ? '✓' : '✗'}
                text={t(v ? 'student.learn.true' : 'student.learn.false')}
                selected={value === v}
                state={stateOf(v)}
                disabled={false}
                onPress={() => !locked && onChange(v)}
              />
            ))
          : null}
        {q.type === 'numeric' || q.type === 'short_text' ? (
          <TextField
            label={t('student.learn.yourAnswer')}
            value={typeof value === 'string' ? value : ''}
            onChangeText={onChange}
            editable={!locked}
            autoFocus={focusText && presentation !== 'kid'}
            keyboardType={q.type === 'numeric' ? 'decimal-pad' : 'default'}
            script={q.type === 'numeric' ? 'latin' : undefined}
            onSubmitEditing={locked ? onNext : onCheck}
          />
        ) : null}
      </View>

      {locked ? (
        <Animated.View
          style={[
            styles.feedback,
            { backgroundColor: result ? colours.correctSoft : colours.surfaceAlt },
            panel,
          ]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.row}>
            <Animated.View
              style={[
                styles.mark,
                { backgroundColor: result ? colours.correct : colours.wrong },
                result ? tick : null,
              ]}
            >
              <Icon name={result ? 'check' : 'close'} size={20} tone="onPrimary" />
            </Animated.View>
            <Text
              variant="heading"
              tone={result ? 'onCorrectSoft' : 'text'}
              accessibilityRole="header"
            >
              {t(result ? 'student.practice.right' : 'student.practice.notQuite')}
            </Text>
          </View>
          {whyWrong ? (
            <View style={styles.why}>
              <Text variant="label">
                {t('student.practice.whyNot', {
                  choice: typeof value === 'string' && q.type === 'mcq' ? value : '',
                })}
              </Text>
              <LessonText source={whyWrong} />
            </View>
          ) : null}
          {result === false && correctText ? (
            <View style={styles.why}>
              <Text variant="label">{t('student.practice.rightAnswer')}</Text>
              <LessonText source={correctText} />
            </View>
          ) : null}
          {view.why ? (
            <View style={styles.why}>
              <Text variant="label">{t('student.practice.whyRight')}</Text>
              <LessonText source={view.why} />
            </View>
          ) : null}
          <View style={styles.actions}>
            {onLesson && result === false ? (
              <Button
                title={t('student.practice.seeLesson')}
                variant="secondary"
                icon="book"
                onPress={onLesson}
              />
            ) : null}
            <View style={styles.flex} />
            <Button
              title={t(isLast ? 'student.practice.finish' : 'student.practice.next')}
              icon={isLast ? 'star' : 'chevronEnd'}
              onPress={onNext}
            />
          </View>
        </Animated.View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.flex} />
          <Button
            title={t('student.practice.check')}
            size="lg"
            onPress={onCheck}
            disabled={!hasAnswer(value)}
          />
        </View>
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  tipBox: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  options: { gap: space.sm },
  feedback: { gap: space.md, padding: space.md, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  why: { gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
