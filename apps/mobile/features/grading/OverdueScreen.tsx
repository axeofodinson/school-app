// Overdue assignments: published homework ≥ 10 days past due, and the active
// students who haven't turned it in (core buildOverdueDashboard, same rule as
// the old app). Teachers see their classes; admins every class.
import { OVERDUE_DAYS } from '@school/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, EmptyState, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ALL } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import { loadOverdue, localToday } from './api';

function Overdue({ scope }: { scope: ReadyScope }) {
  const { t } = useI18n();
  const [classId, setClassId] = useState<string>(ALL);
  const ids = classId === ALL ? scope.classes.map((c) => c.id) : [classId];
  const today = localToday();
  const res = useResult(`o:${scope.year.id}:${ids.join()}:${today}`, () =>
    loadOverdue(scope.year.id, ids, today),
  );
  const cards = res.state?.status === 'ready' ? res.state.data : null;
  const missing = (cards ?? []).reduce((n, c) => n + c.missing.length, 0);

  return (
    <View style={styles.wrap}>
      <Text tone="textMuted">
        {t('console.overdue.subtitle', { days: OVERDUE_DAYS, year: scope.year.label })}
      </Text>
      {scope.classes.length > 1 ? (
        <ChipPicker
          label={t('console.overdue.filterLabel')}
          chips={[
            { value: ALL, label: t('console.overdue.filterAll') },
            ...scope.classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={classId}
          onChange={setClassId}
        />
      ) : null}
      <LoadState state={res.state} title={t('console.overdue.loadError')} onRetry={res.reload} />
      {cards && !cards.length ? (
        <EmptyState icon="checkCircle" title={t('console.overdue.empty', { days: OVERDUE_DAYS })} />
      ) : null}
      {cards && cards.length ? (
        <Text variant="label">
          {t('console.overdue.summary', { count: cards.length, students: missing })}
        </Text>
      ) : null}
      {(cards ?? []).map((c) => (
        <Card key={c.id}>
          <View style={styles.card}>
            <Text variant="heading">{c.title}</Text>
            <Text tone="textMuted">
              {[
                t('console.overdue.card.meta', { class: c.className, subject: c.subjectName }),
                c.scheduled_on ? t('console.overdue.card.due', { date: c.scheduled_on }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={styles.row}>
              <Badge
                icon="clock"
                tone="wrong"
                label={t('console.overdue.card.daysOverdue', { count: c.daysOverdue ?? 0 })}
              />
              {c.totalActive === 0 ? (
                <Text tone="textMuted">{t('console.overdue.card.noRoster')}</Text>
              ) : c.missing.length === 0 ? (
                <Text tone="textMuted">
                  {t('console.overdue.card.allSubmitted', { total: c.totalActive })}
                </Text>
              ) : (
                <Text variant="label">
                  {t('console.overdue.card.missing', {
                    count: c.missing.length,
                    total: c.totalActive,
                  })}
                </Text>
              )}
            </View>
            {c.missing.length ? (
              <View accessibilityRole="list" style={styles.missing}>
                {c.missing.map((m) => (
                  <Text key={m.id}>
                    {[
                      m.roll_number != null
                        ? t('console.overdue.student.roll', { roll: m.roll_number })
                        : t('console.overdue.student.noRoll'),
                      m.student?.full_name ?? m.student?.student_code ?? '—',
                    ].join(' · ')}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

export function OverdueScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.start}
      />
      <Text variant="title" accessibilityRole="header">
        {t('console.overdue.title')}
      </Text>
      <ScopeGate>{(scope) => <Overdue scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  card: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  missing: { gap: space.xxs, paddingStart: space.md },
  start: { alignSelf: 'flex-start' },
});
