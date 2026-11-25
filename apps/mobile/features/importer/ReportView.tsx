// The dry-run report: what will land, what is being left out and why
// (DESIGN_SYSTEM §7.9 review queue: list on the start side, the chosen item's
// detail beside it on desktop). Counts first, because that is what the teacher
// decides on; then the questions, each with its state as an icon + word, never
// colour alone (§2.4).
import type { ImportReport, Issue, IssueCode, QuestionRow, QuestionStatus } from '@school/core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Card,
  Icon,
  Reveal,
  Text,
  TwoPane,
  useTheme,
  type BadgeTone,
  type IconName,
} from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';

const STATUS: Record<QuestionStatus, { icon: IconName; tone: BadgeTone }> = {
  ok: { icon: 'checkCircle', tone: 'correct' },
  similar: { icon: 'warning', tone: 'weak' },
  duplicate: { icon: 'archive', tone: 'neutral' },
  error: { icon: 'close', tone: 'wrong' },
};

export const issueKey = (code: IssueCode): TKey => `staff.importer.issues.${code}` as TKey;

/** One line per count the teacher acts on. */
function Counts({ report }: { report: ImportReport }) {
  const { t } = useI18n();
  const c = report.counts;
  const items: { key: string; label: string; value: number }[] = [
    { key: 'ready', label: t('staff.importer.counts.ready'), value: c.ready },
    { key: 'duplicates', label: t('staff.importer.counts.duplicates'), value: c.duplicates },
    { key: 'similar', label: t('staff.importer.counts.similar'), value: c.similar },
    { key: 'errors', label: t('staff.importer.counts.errors'), value: c.errors },
    { key: 'warnings', label: t('staff.importer.counts.warnings'), value: c.warnings },
  ];
  return (
    <View style={styles.counts}>
      {items.map((i) => (
        <View key={i.key} style={styles.count}>
          <Text variant="title">{i.value}</Text>
          <Text variant="caption" tone="textMuted">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function QuestionLine({
  row,
  selected,
  onPress,
}: {
  row: QuestionRow;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const s = STATUS[row.status];
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${row.index + 1}. ${row.preview || t('staff.importer.noStem')}, ${t(
        `staff.importer.status.${row.status}` as TKey,
      )}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.line,
        {
          minHeight: p.minTarget,
          backgroundColor: selected
            ? colours.primarySoft
            : pressed || hovered
              ? colours.surfaceAlt
              : 'transparent',
        },
        ring,
      ]}
    >
      <Icon name={s.icon} size={18} tone={row.status === 'ok' ? 'correct' : 'textMuted'} />
      <Text variant="caption" tone="textMuted" script="latin" style={styles.num}>
        {row.index + 1}
      </Text>
      <Text variant="bodySm" numberOfLines={1} style={styles.flex}>
        {row.preview || t('staff.importer.noStem')}
      </Text>
      <Badge tone={s.tone} label={t(`staff.importer.status.${row.status}` as TKey)} />
    </Pressable>
  );
}

function IssueList({ issues, title }: { issues: Issue[]; title: string }) {
  const { t } = useI18n();
  if (!issues.length) return null;
  return (
    <View style={styles.block}>
      <Text variant="label">{title}</Text>
      {issues.map((i, n) => (
        <View key={`${i.code}-${i.path}-${n}`} style={styles.issue}>
          <Icon name={i.severity === 'error' ? 'close' : 'warning'} size={16} tone="textMuted" />
          <View style={styles.flex}>
            <Text variant="bodySm">{t(issueKey(i.code), { detail: i.detail ?? '' })}</Text>
            {i.path ? (
              <Text variant="caption" tone="textMuted" script="latin">
                {i.path}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The whole report: counts, file-level problems, and the per-question list. */
export function ReportView({ report, fileName }: { report: ImportReport; fileName: string }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<number | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | null>(null);

  const fileIssues = useMemo(() => report.issues.filter((i) => i.q === undefined), [report]);
  const rows = useMemo(
    () => (filter ? report.rows.filter((r) => r.status === filter) : report.rows),
    [report, filter],
  );
  const row = report.rows.find((r) => r.index === picked) ?? null;
  const rowIssues = useMemo(
    () => (row ? report.issues.filter((i) => i.q === row.index) : []),
    [report, row],
  );

  const filters: { value: QuestionStatus | null; label: string; count: number }[] = [
    { value: null, label: t('staff.importer.filters.all'), count: report.rows.length },
    { value: 'error', label: t('staff.importer.status.error'), count: report.counts.errors },
    {
      value: 'duplicate',
      label: t('staff.importer.status.duplicate'),
      count: report.counts.duplicates,
    },
    { value: 'similar', label: t('staff.importer.status.similar'), count: report.counts.similar },
  ];

  return (
    <View style={styles.block}>
      <Reveal index={0}>
        <Card>
          <View style={styles.head}>
            <Text variant="label" script="latin" numberOfLines={1} style={styles.flex}>
              {fileName}
            </Text>
            <Badge
              tone={report.fileOk ? 'correct' : 'wrong'}
              label={t(report.fileOk ? 'staff.importer.fileOk' : 'staff.importer.fileStopped')}
            />
          </View>
          <Counts report={report} />
          <Text variant="caption" tone="textMuted">
            {t('staff.importer.counts.summary', {
              concepts: report.counts.concepts,
              blocks: report.counts.lessonBlocks,
              maths: report.counts.mathExpressions,
            })}
          </Text>
        </Card>
      </Reveal>

      {fileIssues.length ? (
        <Reveal index={1}>
          <Card>
            <IssueList issues={fileIssues} title={t('staff.importer.fileIssues')} />
          </Card>
        </Reveal>
      ) : null}

      {report.lessons.length ? (
        <Reveal index={2}>
          <Card>
            <Text variant="label">{t('staff.importer.lessons')}</Text>
            {report.lessons.map((l, i) => (
              <View key={`${l.kind}-${l.concept ?? i}`} style={styles.issue}>
                <Icon
                  name={l.ok ? 'checkCircle' : 'close'}
                  size={16}
                  tone={l.ok ? 'correct' : 'textMuted'}
                />
                <Text variant="bodySm" style={styles.flex}>
                  {t(
                    l.kind === 'lesson' ? 'staff.importer.lessonMain' : 'staff.importer.lessonAlt',
                    {
                      concept: l.concept ?? '',
                      blocks: l.blocks,
                    },
                  )}
                </Text>
                <Badge
                  tone={l.ok ? 'correct' : 'wrong'}
                  label={t(
                    l.ok ? 'staff.importer.lessonWillImport' : 'staff.importer.lessonLeftOut',
                  )}
                />
              </View>
            ))}
          </Card>
        </Reveal>
      ) : null}

      {report.rows.length ? (
        <Reveal index={3}>
          <Card style={styles.noPad}>
            <TwoPane
              showDetail={row !== null}
              list={
                <View>
                  <View style={styles.filters}>
                    {filters.map((f) => (
                      <FilterChip
                        key={f.label}
                        label={`${f.label} ${f.count}`}
                        active={filter === f.value}
                        onPress={() => setFilter(f.value)}
                      />
                    ))}
                  </View>
                  {rows.length ? (
                    rows.map((r) => (
                      <QuestionLine
                        key={r.index}
                        row={r}
                        selected={r.index === picked}
                        onPress={() => setPicked(r.index === picked ? null : r.index)}
                      />
                    ))
                  ) : (
                    <Text tone="textMuted" variant="bodySm" style={styles.pad}>
                      {t('staff.importer.filters.none')}
                    </Text>
                  )}
                </View>
              }
              detail={
                row ? (
                  <View style={styles.pad}>
                    <Text variant="label">
                      {t('staff.importer.questionN', { number: row.index + 1 })}
                    </Text>
                    <Text style={styles.stem}>{row.preview || t('staff.importer.noStem')}</Text>
                    <Text variant="caption" tone="textMuted" script="latin">
                      {row.type} · {row.concept}
                    </Text>
                    {row.match ? (
                      <View style={styles.match}>
                        <Text variant="label">
                          {t(
                            row.match.where === 'file'
                              ? 'staff.importer.matchInFile'
                              : 'staff.importer.matchInBank',
                            {
                              ref:
                                row.match.where === 'file'
                                  ? String(Number(row.match.ref) + 1)
                                  : row.match.ref.slice(0, 8),
                              percent: Math.round(row.match.similarity * 100),
                            },
                          )}
                        </Text>
                        <Text variant="bodySm" tone="textMuted">
                          {row.match.preview}
                        </Text>
                      </View>
                    ) : null}
                    <IssueList issues={rowIssues} title={t('staff.importer.whyLeftOut')} />
                  </View>
                ) : (
                  <View style={styles.pad}>
                    <Text tone="textMuted" variant="bodySm">
                      {t('staff.importer.pickQuestion')}
                    </Text>
                  </View>
                )
              }
            />
          </Card>
        </Reveal>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        {
          minHeight: Math.min(p.minTarget, 36),
          borderColor: active ? colours.primary : colours.border,
          backgroundColor: active
            ? colours.primarySoft
            : pressed || hovered
              ? colours.surfaceAlt
              : colours.surface,
        },
        ring,
      ]}
    >
      <Text variant="caption" tone={active ? 'primary' : 'textMuted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  head: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  count: { gap: 2, minWidth: 72 },
  issue: { alignItems: 'flex-start', flexDirection: 'row', gap: space.xs },
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  num: { minWidth: 24 },
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, padding: space.md },
  chip: {
    borderRadius: radius.full,
    borderWidth: strokeWidth.hairline,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  pad: { gap: space.xs, padding: space.md },
  noPad: { padding: 0 },
  stem: { marginTop: space.xs },
  match: { gap: 2, marginTop: space.sm },
});
