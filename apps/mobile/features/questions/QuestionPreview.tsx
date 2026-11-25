import { questionLabel } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import { Badge, Icon, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { ClipPreview } from '../prereader/ClipPreview';
import type { BankQuestion } from './api';

const TYPE_KEYS: Record<string, TKey> = {
  mcq: 'console.assessments.questionTypes.mcq',
  multi_select: 'console.assessments.questionTypes.multi_select',
  numeric: 'console.assessments.questionTypes.numeric',
  short_text: 'console.assessments.questionTypes.short_text',
  true_false: 'console.assessments.questionTypes.true_false',
  tap_image: 'console.assessments.questionTypes.tap_image',
  match: 'console.assessments.questionTypes.match',
};
const LEVEL_KEYS: Record<string, TKey> = {
  recall: 'teacher.questions.cognitive.recall',
  understand: 'teacher.questions.cognitive.understand',
  apply: 'teacher.questions.cognitive.apply',
  analyze: 'teacher.questions.cognitive.analyze',
};

export function useQuestionMeta() {
  const { t } = useI18n();
  return (q: Pick<BankQuestion, 'type' | 'cognitive_level'>) => ({
    type: TYPE_KEYS[q.type] ? t(TYPE_KEYS[q.type]!) : q.type,
    level: LEVEL_KEYS[q.cognitive_level] ? t(LEVEL_KEYS[q.cognitive_level]!) : q.cognitive_level,
  });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function answerText(q: BankQuestion, t: ReturnType<typeof useI18n>['t']): string | null {
  const a = isObj(q.answer) ? q.answer : {};
  const c = a.correct;
  if (q.type === 'true_false' && typeof c === 'boolean') {
    return t(c ? 'teacher.questions.tf.true' : 'teacher.questions.tf.false');
  }
  if (q.type === 'short_text' && typeof c === 'string') {
    const also = Array.isArray(a.also) ? a.also.filter((x) => typeof x === 'string') : [];
    return [c, ...also].join(' · ');
  }
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  return null;
}

/** Read-only view: other teachers' questions, tap_image, and questions already in use. */
export function QuestionPreview({ question }: { question: BankQuestion }) {
  const { t, locale } = useI18n();
  const meta = useQuestionMeta()(question);
  const body = isObj(question.body) ? question.body : {};
  const answer = isObj(question.answer) ? question.answer : {};
  const options = Array.isArray(body.options) ? body.options.filter(isObj) : [];
  const choices = Array.isArray(body.choices) ? body.choices.filter(isObj) : [];
  const ans = question.type === 'mcq' ? null : answerText(question, t);

  return (
    <View style={styles.wrap}>
      <View style={styles.badges}>
        <Badge label={meta.type} />
        <Badge label={meta.level} tone="primary" />
        <Badge label={t('staff.questions.marksBadge', { count: question.default_marks })} />
      </View>
      <Text variant="heading">{questionLabel(question.body, locale) || '—'}</Text>
      {options.map((o) => {
        const correct = o.key === answer.correct;
        return (
          <View key={String(o.key)} style={styles.option}>
            <Icon
              name={correct ? 'checkCircle' : 'chevronEnd'}
              tone={correct ? 'correct' : 'textMuted'}
              size={18}
            />
            <Text style={styles.flex}>
              {String(o.key)}. {String(o.text ?? '')}
              {correct ? `  (${t('staff.questions.correct')})` : ''}
            </Text>
          </View>
        );
      })}
      {choices.map((c) => {
        const label = isObj(c.label) ? (c.label[locale] ?? c.label.en) : '';
        const correct = c.id === answer.correct;
        return (
          <View key={String(c.id)} style={styles.option}>
            <Icon
              name={correct ? 'checkCircle' : 'chevronEnd'}
              tone={correct ? 'correct' : 'textMuted'}
              size={18}
            />
            <Text style={styles.flex}>
              {String(c.emoji ?? '')} {String(label ?? '')}
              {correct ? `  (${t('staff.questions.correct')})` : ''}
            </Text>
          </View>
        );
      })}
      {ans !== null ? (
        <Text>
          {t('staff.questions.correctAnswer')}: {ans}
        </Text>
      ) : null}
      {question.type === 'tap_image' ? <ClipPreview body={question.body} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  dot: { width: 18 },
});
