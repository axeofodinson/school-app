import { questionLabel, type PickedQuestion } from '@school/core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, ListItem, Text } from '../../ui';
import { space } from '../../ui/tokens';
import type { BankQuestion } from '../questions/api';
import { useQuestionMeta } from '../questions/QuestionPreview';
import { ALL } from '../scope/ScopePicker';

/**
 * The subject's question bank, filtered by chapter. Tap a row to add it to the
 * paper or take it off. When the bank is empty it points to the question screen.
 */
export function QuestionPicker({
  questions,
  chapterId,
  picks,
  onToggle,
  isStaff,
}: {
  questions: BankQuestion[];
  chapterId: string | null;
  picks: PickedQuestion[];
  onToggle: (q: BankQuestion) => void;
  isStaff: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const meta = useQuestionMeta();
  const picked = new Set(picks.map((p) => p.questionId));
  const shown = questions.filter(
    (q) => !chapterId || chapterId === ALL || q.chapter_id === chapterId,
  );

  if (!questions.length) {
    return (
      <EmptyState
        icon="pencil"
        title={t('staff.assessments.bankEmpty')}
        body={t(
          isStaff
            ? 'console.assessments.build.noQuestions'
            : 'console.assessments.build.noQuestionsTeacher',
        )}
        action={
          <Button
            title={t('staff.assessments.writeQuestions')}
            variant="secondary"
            onPress={() => router.push('/questions')}
          />
        }
      />
    );
  }
  return (
    <View style={styles.wrap}>
      <Text variant="bodySm" tone="textMuted">
        {t('console.assessments.build.questionsHint')}
      </Text>
      {shown.length === 0 ? (
        <Text tone="textMuted">{t('staff.assessments.chapterEmpty')}</Text>
      ) : null}
      {shown.map((q) => {
        const on = picked.has(q.id);
        const m = meta(q);
        return (
          <ListItem
            key={q.id}
            title={questionLabel(q.body, locale) || '—'}
            subtitle={`${q.chapterTitle} · ${m.type} · ${m.level} · ${t('staff.questions.marksBadge', { count: q.default_marks })}`}
            trailing={
              on ? (
                <Badge label={t('staff.assessments.added')} tone="correct" icon="check" />
              ) : (
                <Badge label={t('staff.assessments.add')} />
              )
            }
            onPress={() => onToggle(q)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.xs } });
