// Teacher and admin home (wireframes TeacherLaunch, AdminHome): a greeting, the
// teacher's classes as hue-topped cards with their next actions (admins see the whole
// school's classes and the year), then every tool as a card. The classes come from
// the same scope the builder uses (RLS decides what is visible).
import { hueForSubject } from '@school/core/design';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
} from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { radius, space, subjectHues } from '../../ui/tokens';
import { AccountActions } from '../auth/AccountActions';
import { useAuth } from '../auth/AuthProvider';
import type { ScopeClass } from '../scope/api';
import { useScope } from '../scope/useScope';
import { staffPlaces } from './StaffFrame';

function greetingKey(hour: number) {
  if (hour < 12) return 'staff.home.morning' as const;
  if (hour < 17) return 'staff.home.afternoon' as const;
  return 'staff.home.evening' as const;
}

function ClassCard({ c }: { c: ScopeClass }) {
  const { t } = useI18n();
  const router = useRouter();
  const { colours, scheme } = useTheme();
  const hue = hueForSubject(c.id);
  return (
    <View
      style={[
        styles.classCard,
        {
          backgroundColor: colours.surface,
          borderColor: colours.border,
          borderTopColor: subjectHues[hue][scheme],
        },
      ]}
    >
      <Text variant="heading" numberOfLines={1}>
        {c.name}
      </Text>
      <Text variant="bodySm" tone="textMuted">
        {c.subjectIds === null
          ? t('staff.home.wholeClass')
          : t('staff.home.subjectCount', { count: c.subjectIds.length })}
      </Text>
      <View style={styles.classActions}>
        <Button
          title={t('staff.home.takeAttendance')}
          icon="calendar"
          size="sm"
          variant="secondary"
          onPress={() => router.navigate('/attendance')}
        />
        <Button
          title={t('staff.home.newTest')}
          icon="plus"
          size="sm"
          variant="secondary"
          onPress={() => router.navigate('/assessments')}
        />
        <Button
          title={t('staff.home.grade')}
          icon="award"
          size="sm"
          variant="ghost"
          onPress={() => router.navigate('/grading')}
        />
      </View>
    </View>
  );
}

function ToolCard({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  hint?: string;
  onPress: () => void;
}) {
  const { colours } = useTheme();
  return (
    <PressableSticker
      radius={radius.md}
      depth="flat"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={styles.toolCell}
      faceStyle={(pressed) => [
        styles.tool,
        {
          backgroundColor: pressed ? colours.surfaceAlt : colours.surface,
          borderColor: colours.border,
        },
      ]}
    >
      <View style={[styles.toolIcon, { backgroundColor: colours.primarySoft }]}>
        <Icon name={icon} size={20} tone="onPrimarySoft" />
      </View>
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        {hint ? (
          <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronEnd" size={18} tone="textMuted" />
    </PressableSticker>
  );
}

export function StaffHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, destination } = useAuth();
  const { colours } = useTheme();
  const { state, reload } = useScope();
  const isAdmin = destination === 'admin';
  const name = profile?.full_name?.trim();
  const scope = state?.status === 'ready' ? state.data : null;
  const places = staffPlaces(isAdmin).filter((p) => p.key !== 'home');

  let classes: React.ReactNode;
  if (!state || state.status === 'loading') classes = <SkeletonLines lines={3} />;
  else if (state.status === 'error')
    classes = (
      <EmptyState
        icon="cloudOff"
        title={t('staff.home.classesError')}
        action={<Button title={t('common.retry')} variant="secondary" onPress={reload} />}
      />
    );
  else if (!scope?.year)
    classes = <EmptyState icon="calendar" title={t('console.academicYears.empty')} />;
  else if (scope.classes.length === 0)
    classes = (
      <EmptyState
        icon="users"
        title={t(isAdmin ? 'staff.home.noClassesAdmin' : 'staff.home.noClassesTeacher')}
      />
    );
  else
    classes = (
      <View style={styles.classGrid}>
        {scope.classes.slice(0, isAdmin ? 8 : 12).map((c, i) => (
          <Reveal key={c.id} index={i + 2} style={styles.classCell}>
            <ClassCard c={c} />
          </Reveal>
        ))}
      </View>
    );

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.flex}>
          {scope?.year ? (
            <Text variant="caption" tone="textMuted" style={styles.kicker}>
              {t('staff.home.year', { year: scope.year.label })}
            </Text>
          ) : null}
          <Reveal index={0}>
            <Text variant="title" accessibilityRole="header">
              {name
                ? t(`${greetingKey(new Date().getHours())}`, { name })
                : t(isAdmin ? 'console.home.title' : 'teacher.home.title')}
            </Text>
          </Reveal>
        </View>
        <AccountActions />
      </View>

      {isAdmin && scope ? (
        <Reveal index={1}>
          <View style={styles.stats}>
            <View
              style={[
                styles.stat,
                { backgroundColor: colours.surface, borderColor: colours.border },
              ]}
            >
              <Text variant="caption" tone="textMuted" style={styles.kicker}>
                {t('staff.home.classesStat')}
              </Text>
              <Text variant="display">{String(scope.classes.length)}</Text>
            </View>
            <View
              style={[
                styles.stat,
                { backgroundColor: colours.surface, borderColor: colours.border },
              ]}
            >
              <Text variant="caption" tone="textMuted" style={styles.kicker}>
                {t('staff.home.yearStat')}
              </Text>
              <Text variant="heading">{scope.year?.label ?? '—'}</Text>
              {scope.year ? (
                <Badge label={t('staff.home.current')} tone="correct" icon="check" />
              ) : null}
            </View>
          </View>
        </Reveal>
      ) : null}

      <Text variant="heading" accessibilityRole="header">
        {t(isAdmin ? 'staff.home.allClasses' : 'staff.home.myClasses')}
      </Text>
      {classes}

      <Text variant="heading" accessibilityRole="header" style={styles.section}>
        {t('staff.home.tools')}
      </Text>
      <View style={styles.toolGrid}>
        {places.map((p, i) => (
          <Reveal key={p.key} index={i + 4} style={styles.toolCellWrap}>
            <ToolCard
              icon={p.icon}
              title={t(p.title)}
              hint={p.hint ? t(p.hint) : undefined}
              onPress={() => router.navigate(p.href)}
            />
          </Reveal>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.sm },
  kicker: { fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  section: { marginTop: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: {
    flexGrow: 1,
    flexBasis: 180,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
  },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  classCell: { flexGrow: 1, flexBasis: 260, maxWidth: 520 },
  classCard: {
    padding: space.lg,
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 10,
  },
  classActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  toolCellWrap: { flexGrow: 1, flexBasis: 260 },
  toolCell: { flexGrow: 1 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: 1,
    minHeight: 64,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
