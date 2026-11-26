// "Due for revision" on Prepare (prompt 42, db/037): mastered ideas come back
// after 7 days, then 30, for a short check. Due ones get a Revise button (a
// 5-question revision set on that idea); the next few later ones show as one
// quiet line so the learner knows what's coming. Never blocks anything.
import { daysUntil, REVISION, type RevisionModel } from '@school/core';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, Icon, Reveal, Text, useTheme } from '../../ui';
import { hueForSubject, space, subjectHues } from '../../ui/tokens';
import type { RevisionItem } from './api';

const UPCOMING_SHOWN = 3;

function useTitle() {
  const { locale } = useI18n();
  const ur = locale === 'ur';
  return {
    concept: (r: RevisionItem) => (ur ? r.conceptUr : null) || r.conceptEn,
    topic: (r: RevisionItem) => (ur ? r.topicUr : null) || r.topicEn,
  };
}

function DueRow({ r, root, now }: { r: RevisionItem; root: string; now: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const titles = useTitle();
  const { colours, scheme } = useTheme();
  const hue = hueForSubject(r.subjectId ?? r.conceptId);
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  const late = r.nextReviewAt ? Math.floor((now - Date.parse(r.nextReviewAt)) / 86_400_000) : 0;
  return (
    <Card padded={false}>
      <View style={styles.row}>
        <View style={styles.top}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: subjectHues[hue][scheme], borderColor: outline },
            ]}
          >
            <Icon name="replay" size={20} colour={colours.ink} />
          </View>
          <View style={styles.flex}>
            <Text variant="heading" numberOfLines={2}>
              {titles.concept(r)}
            </Text>
            <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
              {[r.subjectName, titles.topic(r)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge
            label={t(r.stage === 2 ? 'student.revision.stage2' : 'student.revision.stage1')}
            tone="learning"
            icon="clock"
          />
        </View>
        <View style={styles.actions}>
          <Text variant="bodySm" tone="textMuted" style={styles.flex}>
            {late > 0 ? t('student.revision.late', { count: late }) : t('student.revision.dueNow')}
          </Text>
          <Button
            title={t('student.revision.revise', { count: REVISION.setSize })}
            icon="replay"
            size="sm"
            disabled={!r.topicId}
            onPress={() =>
              r.topicId &&
              router.push(
                `${root}/${r.topicId}/practice?mode=revise&concept=${r.conceptId}` as Href,
              )
            }
          />
        </View>
      </View>
    </Card>
  );
}

export function RevisionSection({
  model,
  now,
  root = '/lesson',
}: {
  model: RevisionModel<RevisionItem>;
  now: number;
  root?: string;
}) {
  const { t } = useI18n();
  const titles = useTitle();
  const { colours } = useTheme();
  const later = model.upcoming.slice(0, UPCOMING_SHOWN);
  if (!model.due.length && !later.length) return null;

  return (
    <View style={styles.wrap}>
      <Reveal index={3}>
        <View style={styles.head}>
          <Text variant="heading" accessibilityRole="header" style={styles.flex}>
            {t('student.revision.title')}
          </Text>
          {model.due.length ? (
            <Badge label={String(model.due.length)} tone="learning" icon="replay" />
          ) : null}
        </View>
        <Text variant="bodySm" tone="textMuted">
          {t(model.due.length ? 'student.revision.body' : 'student.revision.nothingDue')}
        </Text>
      </Reveal>
      {model.due.map((r, i) => (
        <Reveal key={r.conceptId} index={Math.min(i + 4, 9)}>
          <DueRow r={r} root={root} now={now} />
        </Reveal>
      ))}
      {later.length ? (
        <Reveal index={Math.min(model.due.length + 4, 9)}>
          <View style={[styles.later, { borderColor: colours.border }]}>
            {later.map((r) => {
              const days = r.nextReviewAt ? daysUntil(r.nextReviewAt, now) : 0;
              return (
                <View key={r.conceptId} style={styles.laterRow}>
                  <Icon name="calendar" size={16} tone="textMuted" />
                  <Text variant="bodySm" tone="textMuted" numberOfLines={1} style={styles.flex}>
                    {titles.concept(r)}
                  </Text>
                  <Text variant="bodySm" tone="textMuted">
                    {t('student.revision.inDays', { count: days })}
                  </Text>
                </View>
              );
            })}
          </View>
        </Reveal>
      ) : null}
      {model.retained ? (
        <Text variant="caption" tone="textMuted">
          {t('student.revision.retained', { count: model.retained })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  row: { padding: space.md, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '4deg' }],
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  later: {
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  laterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
