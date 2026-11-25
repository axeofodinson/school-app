// The Me tab: who is signed in, and everything about "my" school life in one place
// (messages, scores, report card, attendance, settings, sign out).
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Icon, Reveal, Screen, Text, useTheme, type IconName } from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { radiusFor, space, type ColourRoles } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { useHome } from '../attempts/useHome';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../messages/MessagesProvider';
import { useStudentNav } from './StudentNav';

function Row({
  title,
  note,
  icon,
  soft,
  fg,
  badge,
  onPress,
}: {
  title: string;
  note: string;
  icon: IconName;
  soft: keyof ColourRoles;
  fg: keyof ColourRoles;
  badge?: string;
  onPress: () => void;
}) {
  const { colours, presentation } = useTheme();
  return (
    <PressableSticker
      radius={radiusFor('lg', presentation)}
      depth="stickerSm"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${title}, ${badge}` : title}
      faceStyle={(pressed) => [
        styles.row,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colours[soft] }]}>
        <Icon name={icon} tone={fg} size={24} />
      </View>
      <View style={styles.flex}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
          {note}
        </Text>
      </View>
      {badge ? (
        <Badge label={badge} tone="primary" icon="star" />
      ) : (
        <Icon name="chevronEnd" tone="textMuted" />
      )}
    </PressableSticker>
  );
}

export function MeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, signOut, sharedMode } = useAuth();
  const { unreadCount } = useMessages();
  const { state } = useHome(false);
  const nav = useStudentNav('me');
  const enr =
    state?.status === 'ready' && typeof state.data.enrollment !== 'string'
      ? state.data.enrollment
      : null;
  const rows = [
    {
      key: 'inbox',
      title: t('student.inbox.title'),
      note: t('student.inbox.subtitle'),
      icon: 'mail' as const,
      soft: 'primarySoft' as const,
      fg: 'onPrimarySoft' as const,
      badge: unreadCount > 0 ? t('student.inbox.newCount', { count: unreadCount }) : undefined,
      href: '/inbox' as const,
    },
    {
      key: 'results',
      title: t('student.home.scores'),
      note: t('student.home.scoresNote'),
      icon: 'chart' as const,
      soft: 'correctSoft' as const,
      fg: 'onCorrectSoft' as const,
      href: '/results' as const,
    },
    {
      key: 'report',
      title: t('student.home.report'),
      note: t('student.home.reportNote'),
      icon: 'award' as const,
      soft: 'accentSoft' as const,
      fg: 'onAccentSoft' as const,
      href: '/report' as const,
    },
    {
      key: 'attendance',
      title: t('student.home.attendance'),
      note: t('student.home.attendanceNote'),
      icon: 'calendar' as const,
      soft: 'learningSoft' as const,
      fg: 'onLearningSoft' as const,
      href: '/attendance' as const,
    },
    {
      key: 'settings',
      title: t('auth.settings.title'),
      note: t('student.me.settingsNote'),
      icon: 'sliders' as const,
      soft: 'surfaceAlt' as const,
      fg: 'text' as const,
      href: '/settings' as const,
    },
  ];
  return (
    <Screen
      header={
        <StudentHeader
          tab
          title={profile?.full_name?.trim() || t('student.me.title')}
          subtitle={enr ? enr.className : undefined}
        />
      }
      {...nav}
    >
      {rows.map((r, i) => (
        <Reveal key={r.key} index={i + 1}>
          <Row {...r} onPress={() => router.push(r.href)} />
        </Reveal>
      ))}
      {sharedMode ? null : (
        <Reveal index={rows.length + 1}>
          <Button title={t('auth.signOut')} variant="secondary" onPress={() => signOut()} />
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
