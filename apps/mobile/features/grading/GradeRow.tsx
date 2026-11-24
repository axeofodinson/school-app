// One student in the grading grid: who, where their work is, the score field
// and (only when changing an existing grade) the reason field. Enter saves the
// row. The edit history opens inline. All rules come from @school/core; the
// RPC re-checks every one of them.
import {
  fmtScore,
  gradeBlocksAttempt,
  gradeState,
  parseScore,
  reasonRequired,
  type GradeState,
} from '@school/core';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  SkeletonLines,
  Text,
  TextField,
  useToast,
  type BadgeTone,
  type TextFieldHandle,
} from '../../ui';
import { space } from '../../ui/tokens';
import type { AssessmentSummary } from '../assessments/api';
import { useResult } from '../scope/useResult';
import {
  loadHistory,
  recordGrade,
  type GradeRow as Row,
  type GradeSaveError,
  type GradeSubmission,
} from './api';

const STATE: Record<GradeState, { key: TKey; tone: BadgeTone }> = {
  graded: { key: 'console.grading.states.graded', tone: 'correct' },
  ungraded: { key: 'console.grading.states.ungraded', tone: 'accent' },
  notSubmitted: { key: 'console.grading.states.notSubmitted', tone: 'neutral' },
};

const SAVE_ERRORS: Record<GradeSaveError, TKey> = {
  reason_required: 'console.grading.errors.reasonRequired',
  not_authorized: 'console.grading.errors.not_authorized',
  assessment_not_found: 'console.grading.errors.assessment_not_found',
  enrollment_class_mismatch: 'console.grading.errors.enrollment_class_mismatch',
  score_required: 'console.grading.errors.scoreRequired',
  score_out_of_range: 'console.grading.errors.score_out_of_range',
  network: 'console.grading.errors.network',
  forbidden: 'console.grading.errors.not_authorized',
  notConfigured: 'auth.errors.notConfigured',
  unknown: 'console.grading.errors.unknown',
};

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-GB', { numberingSystem: 'latn' });
}

function History({ submissionId }: { submissionId: string }) {
  const { t, locale } = useI18n();
  const res = useResult(`h:${submissionId}`, () => loadHistory(submissionId));
  if (!res.state || res.state.status === 'loading') return <SkeletonLines lines={2} />;
  if (res.state.status === 'error') {
    return (
      <View style={styles.row}>
        <Text tone="onWrongSoft">{t('console.grading.historyLoadError')}</Text>
        <Button title={t('staff.retry')} variant="ghost" size="sm" onPress={res.reload} />
      </View>
    );
  }
  if (!res.state.data.length)
    return <Text tone="textMuted">{t('console.grading.historyEmpty')}</Text>;
  return (
    <View accessibilityRole="list" style={styles.history}>
      {res.state.data.map((h) => (
        <View key={h.id} style={styles.historyItem}>
          <Text variant="label" script="latin">
            {h.prev_score == null
              ? t('console.grading.historyFirst', { new: fmtScore(h.new_score) })
              : t('console.grading.historyChange', {
                  prev: fmtScore(h.prev_score),
                  new: fmtScore(h.new_score),
                })}
          </Text>
          <Text variant="bodySm" tone="textMuted">
            {t('console.grading.historyMeta', {
              reason: h.reason,
              date: fmtDate(h.edited_at, locale),
            })}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GradeRow({
  row,
  assessment,
  onSaved,
}: {
  row: Row;
  assessment: AssessmentSummary;
  onSaved: (enrollmentId: string, s: GradeSubmission) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const sub = row.submission;
  const current = sub?.score ?? null;
  const state = gradeState(sub);
  const [score, setScore] = useState(fmtScore(current));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const reasonRef = useRef<TextFieldHandle>(null);

  const total = assessment.total_marks;
  const parsed = parseScore(score, total);
  const dirty = score.trim() !== fmtScore(current);
  const needsReason = 'value' in parsed && reasonRequired(current, parsed.value);
  const warnAttempt = dirty && gradeBlocksAttempt(assessment, sub);
  const name = row.student?.full_name ?? row.student?.student_code ?? '—';

  const save = async () => {
    if (saving || !dirty) return;
    setError(null);
    setReasonError(undefined);
    if ('error' in parsed) return setError(t(`console.grading.errors.${parsed.error}`));
    if (needsReason && !reason.trim()) {
      setReasonError(t('console.grading.errors.reasonRequired'));
      reasonRef.current?.focus();
      return;
    }
    setSaving(true);
    const res = await recordGrade(row.enrollmentId, assessment.id, parsed.value, reason);
    setSaving(false);
    if (!res.ok) {
      const msg = t(SAVE_ERRORS[res.error]);
      return res.error === 'reason_required' ? setReasonError(msg) : setError(msg);
    }
    setReason('');
    setScore(fmtScore(res.data.score));
    setHistoryKey((k) => k + 1);
    onSaved(row.enrollmentId, res.data);
    toast(t('staff.grading.saved', { name, score: fmtScore(res.data.score) }), 'success');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.who}>
          <Text variant="label">
            {row.rollNumber != null ? `${row.rollNumber}. ${name}` : name}
          </Text>
          <View style={styles.row}>
            <Badge label={t(STATE[state].key)} tone={STATE[state].tone} />
            {sub && sub.edit_count > 0 ? (
              <Text variant="caption" tone="textMuted">
                {t('console.grading.lastEdited', {
                  count: sub.edit_count,
                  date: fmtDate(sub.last_edited_at, locale),
                })}
              </Text>
            ) : null}
          </View>
        </View>
        <TextField
          label={t('console.grading.scoreLabel')}
          helper={total != null ? t('console.grading.outOf', { total }) : undefined}
          placeholder={t('console.grading.scorePlaceholder')}
          value={score}
          onChangeText={(v) => {
            setScore(v);
            setError(null);
          }}
          onSubmitEditing={save}
          keyboardType="decimal-pad"
          script="latin"
          maxLength={7}
          error={error ?? undefined}
          accessibilityLabel={t('staff.grading.scoreFor', { name })}
          style={styles.score}
        />
      </View>
      {needsReason ? (
        <TextField
          ref={reasonRef}
          label={t('console.grading.reasonLabel')}
          placeholder={t('console.grading.reasonPlaceholder')}
          helper={t('console.grading.reasonHint')}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setReasonError(undefined);
          }}
          onSubmitEditing={save}
          error={reasonError}
          maxLength={300}
        />
      ) : null}
      {warnAttempt ? (
        <Text variant="bodySm" tone="textMuted" accessibilityLiveRegion="polite">
          {t('staff.grading.beforeAttempt')}
        </Text>
      ) : null}
      <View style={styles.row}>
        {dirty ? (
          <>
            <Button
              title={t(saving ? 'console.grading.saving' : 'console.grading.save')}
              icon="check"
              size="sm"
              loading={saving}
              disabled={saving}
              onPress={save}
              accessibilityHint={t('staff.saveShortcut')}
            />
            <Button
              title={t('console.grading.cancel')}
              variant="ghost"
              size="sm"
              disabled={saving}
              onPress={() => {
                setScore(fmtScore(current));
                setReason('');
                setError(null);
                setReasonError(undefined);
              }}
            />
          </>
        ) : null}
        {sub && state === 'graded' ? (
          <Button
            title={t(historyOpen ? 'console.grading.hideHistory' : 'console.grading.showHistory')}
            icon="clock"
            variant="ghost"
            size="sm"
            onPress={() => setHistoryOpen((o) => !o)}
          />
        ) : null}
      </View>
      {historyOpen && sub ? <History key={historyKey} submissionId={sub.id} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingVertical: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  who: { flexGrow: 1, flexBasis: 200, gap: space.xxs },
  score: { width: 160 },
  history: { gap: space.sm, paddingStart: space.md },
  historyItem: { gap: space.xxs },
});
