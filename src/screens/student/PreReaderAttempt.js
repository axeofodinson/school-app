// PreReaderAttempt — the question experience for children who can't read yet
// (PG–2). Rendered by AssessmentAttemptScreen when every question in the test
// is a well-formed tap_image (content-driven — the data decides, nothing is
// hardcoded per class). All the plumbing (loading, question cache, draft
// autosave, offline submit queue) stays in the parent; this component is pure
// experience.
//
// The shape of a turn, tuned for a 5-year-old:
//   1. ONE question fills the screen — no list, no scroll hunting.
//   2. The question is HEARD, not read: it auto-plays on arrival (recorded
//      audio from the question data when present, else TTS of the
//      human-written prompt), and the big breathing speaker replays it.
//   3. The child taps a PICTURE. The card bounces, goes gold, pops a star —
//      picking feels like play, and re-picking is allowed (small fingers
//      graze).
//   4. The big green ✓ locks it in (ding!) and slides to the next question.
//   5. Progress is a trail of stars, not "3/6" — answered stars are tappable
//      to go back and change an answer.
//
// What it deliberately does NOT do: show right/wrong. The attempt flow never
// fetches questions.answer (grading is a later teacher pass — rule 3), so the
// celebration rewards finishing, and every child lands warm.
import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Text } from '../../components';
import { QuestScreen, QuestButton, QuestBadge, Enter } from '../../components/quest';
import {
  TapImageChoices,
  SpeakerButton,
  StarTrail,
  ConfirmButton,
} from '../../components/prereader';
import { t, getLocale } from '../../i18n';
import { isAnswered } from '../../lib/attemptStore';
import { promptText, promptAudio } from '../../prereader/tapImage';
import { playEffect, speakPrompt, stopPrompt } from '../../prereader/sound';
import { quest, spacing, displayText } from '../../theme/quest';

export default function PreReaderAttempt({
  questions,
  answers, // { questionId: choiceId } — parent drafts this to storage
  onAnswer, // (questionId, choiceId) => void
  onSubmit, // () => void — parent submits/queues (offline-safe)
  submitting,
  errorKey, // parent-facing submit error (i18n key under student.attempt.errors)
  usingCache, // offline — parent loaded the cached question set
  onBack,
}) {
  // Resume where the child left off: the first unanswered question.
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((q) => !isAnswered(q.type, answers[q.id]));
    return first === -1 ? questions.length - 1 : first;
  });

  const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
  const question = questions[safeIndex];
  const locale = getLocale();
  const prompt =
    promptText(question.body, locale) ?? t('student.prereader.tapFallback');
  const selected = answers[question.id];
  const isLast = safeIndex === questions.length - 1;

  const sayPrompt = useCallback(() => {
    speakPrompt({
      audio: promptAudio(question.body, locale),
      text: prompt,
      locale,
    });
  }, [question.body, prompt, locale]);

  // The question introduces itself out loud when it arrives…
  useEffect(() => {
    sayPrompt();
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and goes quiet when the child leaves the test.
  useEffect(() => () => { stopPrompt(); }, []);

  const pick = useCallback(
    (choiceId) => {
      if (submitting) return;
      playEffect('pop');
      onAnswer(question.id, choiceId);
    },
    [submitting, onAnswer, question.id]
  );

  const confirm = useCallback(() => {
    if (submitting) return;
    playEffect('ding');
    stopPrompt();
    if (isLast) {
      onSubmit();
    } else {
      setIndex(safeIndex + 1);
    }
  }, [submitting, isLast, onSubmit, safeIndex]);

  return (
    <QuestScreen scroll>
      {/* Star trail + the (parent-facing) way out. */}
      <View style={styles.topRow}>
        <StarTrail
          total={questions.length}
          current={safeIndex}
          isDone={(i) => isAnswered(questions[i].type, answers[questions[i].id])}
          onJump={setIndex}
          slotLabel={(i) => t('student.attempt.questionNumber', { number: i + 1 })}
          style={styles.trail}
        />
        <QuestButton
          variant="ghost"
          size="sm"
          label={t('student.attempt.back')}
          onPress={onBack}
        />
      </View>

      {usingCache ? (
        <QuestBadge
          label={t('student.prereader.offline')}
          tone="sky"
          style={styles.offline}
        />
      ) : null}

      {/* The question — keyed so each arrival animates in fresh. */}
      <Enter key={question.id} distance={20} style={styles.stage}>
        <SpeakerButton
          onPress={sayPrompt}
          accessibilityLabel={t('student.prereader.listen')}
          style={styles.speaker}
        />
        <Text color={quest.ink} align="center" style={[styles.prompt, displayText(22)]}>
          {prompt}
        </Text>
        <TapImageChoices
          body={question.body}
          selectedId={selected}
          onSelect={pick}
          disabled={submitting}
          size="big"
          style={styles.choices}
        />
      </Enter>

      {errorKey ? (
        <Text variant="caption" color={quest.red} align="center" style={styles.error}>
          {t(`student.attempt.errors.${errorKey}`)}
        </Text>
      ) : null}

      {/* Fixed-height dock so the ✓ popping in never shoves the cards around. */}
      <View style={styles.confirmDock}>
        {selected != null ? (
          <ConfirmButton
            key={`${question.id}:confirm`}
            onPress={confirm}
            loading={submitting}
            accessibilityLabel={
              isLast
                ? t('student.prereader.finish')
                : t('student.prereader.next')
            }
          />
        ) : null}
      </View>
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trail: { flex: 1, marginEnd: spacing.sm },
  offline: { alignSelf: 'center', marginTop: spacing.sm },
  stage: { alignItems: 'center', marginTop: spacing.lg },
  speaker: { marginBottom: spacing.md },
  prompt: { marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  choices: { alignSelf: 'stretch' },
  error: { marginTop: spacing.sm },
  confirmDock: {
    height: 88 + 8, // button + its hard edge
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
