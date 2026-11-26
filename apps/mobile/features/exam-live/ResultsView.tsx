// Results of one exam (prompt 51): the score spread, then item analysis, one
// card per question in paper order: % right, the flag (easy / hard / trap),
// and for choice questions how many picked each option, the key marked with a
// tick and a word (never colour alone). Bars are Meters: the number always sits
// beside the bar for screen readers.
import {
  choiceRows,
  itemFlag,
  pct,
  plainLabel,
  scoreBands,
  stemText,
  topDistractor,
  type ItemFlag,
} from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Meter,
  Reveal,
  Text,
  type BadgeTone,
} from '../../ui';
import { space } from '../../ui/tokens';
import type { ItemAnalysis, ItemRow } from './api';

const FLAG_TONE: Record<Exclude<ItemFlag, null>, BadgeTone> = {
  easy: 'correct',
  hard: 'wrong',
  trap: 'weak',
};
const BAND_LABELS = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'];

function BarRow({
  label,
  value,
  count,
  tone,
  strong,
  a11y,
}: {
  label: string;
  value: number;
  count: string;
  tone: 'primary' | 'correct' | 'weak' | 'textMuted';
  strong?: boolean;
  a11y: string;
}) {
  return (
    <View style={styles.bar} accessible accessibilityLabel={a11y}>
      <Text variant={strong ? 'label' : 'bodySm'} style={styles.barLabel} numberOfLines={2}>
        {label}
      </Text>
      <Meter value={value} tone={tone} height={10} style={styles.flex} />
      <Text variant="label" style={styles.barCount}>
        {count}
      </Text>
    </View>
  );
}

function ItemCard({ item, index }: { item: ItemRow; index: number }) {
  const { t, locale } = useI18n();
  const flag = itemFlag(item);
  const right = pct(item.correct, item.papers);
  const stem = plainLabel(stemText(item.body, locale), 160);
  const concept = (locale === 'ur' ? item.conceptUr : null) || item.conceptEn;
  const choice = item.type === 'mcq' || item.type === 'true_false';
  const rows = choice ? choiceRows(item.type, item.body, item.choices, item.key) : [];
  const trap = flag === 'trap' ? topDistractor(item) : null;
  const optLabel = (k: string) =>
    item.type === 'true_false'
      ? t(k === 'true' ? 'staff.examLive.true' : 'staff.examLive.false')
      : k;

  return (
    <Card>
      <View style={styles.itemHead}>
        <Text variant="label" tone="textMuted">
          {t('staff.examLive.qNo', { n: index + 1 })}
        </Text>
        <Text variant="body" style={styles.flex}>
          {stem || t('staff.examLive.noText')}
        </Text>
        {flag ? <Badge label={t(`staff.examLive.flag.${flag}`)} tone={FLAG_TONE[flag]} /> : null}
      </View>
      {concept ? (
        <Text variant="caption" tone="textMuted">
          {concept}
        </Text>
      ) : null}
      <BarRow
        label={t('staff.examLive.right')}
        value={item.papers ? item.correct / item.papers : 0}
        count={right == null ? '—' : `${right}%`}
        tone="primary"
        strong
        a11y={t('staff.examLive.rightA11y', { correct: item.correct, papers: item.papers })}
      />
      {item.toMark ? (
        <Text variant="bodySm" tone="textMuted">
          {t('staff.examLive.toMark', { count: item.toMark })}
        </Text>
      ) : null}
      {rows.length ? (
        <View style={styles.choices}>
          {rows.map((r) => {
            const label = r.text
              ? `${optLabel(r.key)} · ${plainLabel(r.text, 40)}`
              : optLabel(r.key);
            return (
              <View key={r.key} style={styles.choiceRow}>
                <View style={styles.tick}>
                  {r.correct ? <Icon name="check" size={16} /> : null}
                </View>
                <View style={styles.flex}>
                  <BarRow
                    label={r.correct ? `${label} (${t('staff.examLive.key')})` : label}
                    value={item.papers ? r.count / item.papers : 0}
                    count={String(r.count)}
                    tone={r.correct ? 'correct' : trap?.key === r.key ? 'weak' : 'textMuted'}
                    strong={r.correct}
                    a11y={t(
                      r.correct ? 'staff.examLive.choiceKeyA11y' : 'staff.examLive.choiceA11y',
                      {
                        option: label,
                        count: r.count,
                      },
                    )}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {trap ? (
        <Text variant="bodySm" tone="textMuted">
          {t('staff.examLive.trapNote', { option: optLabel(trap.key), count: trap.count })}
        </Text>
      ) : null}
    </Card>
  );
}

export function ResultsView({
  analysis,
  scores,
  totalMarks,
  average,
  confirmed,
  confirmedAt,
  canConfirm,
  stillOpen,
  onConfirm,
}: {
  analysis: ItemAnalysis | null;
  scores: number[];
  totalMarks: number;
  average: number | null;
  confirmed: boolean;
  confirmedAt: string | null;
  canConfirm: boolean;
  stillOpen: number;
  onConfirm: () => void;
}) {
  const { t, locale } = useI18n();
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
      numberingSystem: 'latn',
    });
  if (!scores.length) {
    return (
      <EmptyState
        icon="chart"
        title={t('staff.examLive.noPapers')}
        body={t('staff.examLive.noPapersBody')}
      />
    );
  }
  const bands = scoreBands(scores, totalMarks);
  const most = Math.max(1, ...bands);
  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.summary}>
          <View style={styles.flex}>
            <Text variant="heading">{t('staff.examLive.spread')}</Text>
            <Text tone="textMuted">
              {t('staff.examLive.averageLine', {
                average: average ?? 0,
                total: totalMarks,
                count: scores.length,
              })}
            </Text>
          </View>
          {confirmed ? (
            <Badge
              label={t('staff.examLive.confirmedOn', {
                date: confirmedAt ? formatDate(confirmedAt) : '',
              })}
              tone="correct"
              icon="checkCircle"
            />
          ) : (
            <Button
              title={t('staff.examLive.confirm')}
              icon="checkCircle"
              disabled={!canConfirm || stillOpen > 0}
              onPress={onConfirm}
            />
          )}
        </View>
        {!confirmed ? (
          <Text variant="bodySm" tone="textMuted">
            {stillOpen > 0
              ? t('staff.examLive.waitOpen', { count: stillOpen })
              : t('staff.examLive.notInGrades')}
          </Text>
        ) : null}
        {bands.map((n, i) => (
          <BarRow
            key={BAND_LABELS[i]}
            label={BAND_LABELS[i]!}
            value={n / most}
            count={String(n)}
            tone="primary"
            a11y={t('staff.examLive.bandA11y', { band: BAND_LABELS[i]!, count: n })}
          />
        ))}
      </Card>
      {analysis && analysis.items.length ? (
        <>
          <Text variant="heading" accessibilityRole="header">
            {t('staff.examLive.items')}
          </Text>
          {analysis.papers < 5 ? (
            <Text variant="bodySm" tone="textMuted">
              {t('staff.examLive.fewPapers')}
            </Text>
          ) : null}
          {analysis.items.map((it, i) => (
            <Reveal key={it.questionId} index={Math.min(i, 8)}>
              <ItemCard item={it} index={i} />
            </Reveal>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
  barLabel: { width: 130 },
  barCount: { minWidth: 40 },
  choices: { gap: 2 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tick: { width: 18, alignItems: 'center' },
});
