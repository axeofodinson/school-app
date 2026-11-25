// The teacher/admin frame: from desktop width (Windows PCs, Chromebook full screen)
// every staff screen sits next to a sidebar with the console's sections (wireframes
// TeacherLaunch, AdminHome). Below that, screens are full width and the home screen
// lists the same places as cards. Navigation convenience only: RLS decides access.
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Button,
  StaffSidebar,
  useLayout,
  useTheme,
  type IconName,
  type StaffNavItem,
} from '../../ui';
import { useAuth } from '../auth/AuthProvider';

export type StaffPlace = {
  key: string;
  href: Href;
  icon: IconName;
  title: TKey;
  hint?: TKey;
  /** Title on the home screen's tool card, when it reads better as an action. */
  cardTitle?: TKey;
  adminOnly?: boolean;
};

/** Every staff place, in sidebar order. Home differs by role. */
export function staffPlaces(isAdmin: boolean): StaffPlace[] {
  const all: StaffPlace[] = [
    { key: 'home', href: isAdmin ? '/school' : '/classes', icon: 'home', title: 'staff.nav.home' },
    {
      key: 'attendance',
      href: '/attendance',
      icon: 'calendar',
      title: 'console.attendance.title',
      hint: 'staff.home.attendanceHint',
    },
    {
      key: 'attendance-summary',
      href: '/attendance-summary',
      icon: 'chart',
      title: 'staff.attendanceSummary.title',
      hint: 'staff.home.attendanceSummaryHint',
    },
    {
      key: 'assessments',
      href: '/assessments',
      icon: 'clipboard',
      title: 'console.assessments.title',
      hint: 'staff.home.assessmentsHint',
    },
    {
      key: 'questions',
      href: '/questions',
      icon: 'book',
      title: 'teacher.questions.title',
      hint: 'staff.home.questionsHint',
    },
    {
      key: 'curriculum',
      href: '/curriculum',
      icon: 'layers',
      title: 'staff.curriculum.title',
      hint: 'staff.curriculum.navHint',
    },
    {
      key: 'importer',
      href: '/importer',
      icon: 'upload',
      title: 'staff.importer.title',
      hint: 'staff.importer.navHint',
    },
    {
      key: 'grading',
      href: '/grading',
      icon: 'award',
      title: 'console.grading.title',
      hint: 'staff.home.gradingHint',
    },
    {
      key: 'overdue',
      href: '/overdue',
      icon: 'clock',
      title: 'console.overdue.title',
      hint: 'staff.home.overdueHint',
    },
    {
      key: 'messages',
      href: '/messages',
      icon: 'mail',
      title: 'staff.nav.messages',
      cardTitle: 'teacher.home.openMessages',
      hint: 'staff.home.messagesHint',
    },
    {
      key: 'qr-cards',
      href: '/qr-cards',
      icon: 'qr',
      title: 'auth.cards.open',
      hint: 'staff.home.cardsHint',
      adminOnly: true,
    },
    {
      key: 'link-prep',
      href: '/link-prep',
      icon: 'users',
      title: 'console.linkPrep.open',
      hint: 'console.linkPrep.openHint',
      adminOnly: true,
    },
    {
      key: 'settings',
      href: '/settings',
      icon: 'sliders',
      title: 'auth.settings.title',
      hint: 'staff.home.settingsHint',
    },
  ];
  return all.filter((p) => isAdmin || !p.adminOnly);
}

function activeKey(pathname: string, places: StaffPlace[]): string | null {
  const hit = places
    .filter((p) => p.key !== 'home')
    .find((p) => pathname === p.href || pathname.startsWith(`${String(p.href)}/`));
  if (hit) return hit.key;
  return pathname === '/school' || pathname === '/classes' ? 'home' : null;
}

export function StaffFrame({ children }: { children: ReactNode }) {
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { twoPane } = useLayout();
  const { colours } = useTheme();
  const { destination, signOut } = useAuth();
  if (!twoPane) return <>{children}</>;
  const isAdmin = destination === 'admin';
  const places = staffPlaces(isAdmin);
  const items: StaffNavItem[] = places.map((p) => ({
    key: p.key,
    label: t(p.title),
    icon: p.icon,
    onPress: () => router.replace(p.href),
  }));
  return (
    <View style={[styles.row, { backgroundColor: colours.bg, direction: isRTL ? 'rtl' : 'ltr' }]}>
      <StaffSidebar
        brand={t(isAdmin ? 'staff.nav.brandAdmin' : 'staff.nav.brandTeacher')}
        items={items}
        active={activeKey(pathname, places)}
        footer={
          <Button title={t('auth.signOut')} variant="ghost" size="sm" onPress={() => signOut()} />
        }
      />
      <View style={styles.fill}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  fill: { flex: 1 },
});
