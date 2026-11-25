// The student app's frame (wireframe "Student Home"): Home · Prepare · Tests · Me as a
// bottom bar on phones and Chromebook windows, a side rail from desktop width
// (tokens.layoutFor navigation). Tabs are peers: switching never slides.
import { useRouter } from 'expo-router';

import { useI18n } from '../../i18n';
import { TabBar, useLayout, type TabBarItem } from '../../ui';
import { useMessages } from '../messages/MessagesProvider';

export type StudentTab = 'home' | 'prepare' | 'tests' | 'me';

const HREF: Record<StudentTab, '/learn' | '/prepare' | '/tests' | '/me'> = {
  home: '/learn',
  prepare: '/prepare',
  tests: '/tests',
  me: '/me',
};

/** `footer` / `aside` props for <Screen> on a tab's root screen. */
export function useStudentNav(active: StudentTab) {
  const { t } = useI18n();
  const router = useRouter();
  const { navigation } = useLayout();
  const { unreadCount } = useMessages();
  const go = (tab: StudentTab) => {
    if (tab !== active) router.replace(HREF[tab]);
  };
  const items: TabBarItem[] = [
    { key: 'home', label: t('student.nav.home'), icon: 'home', onPress: () => go('home') },
    {
      key: 'prepare',
      label: t('student.nav.prepare'),
      icon: 'mosaic',
      onPress: () => go('prepare'),
    },
    { key: 'tests', label: t('student.nav.tests'), icon: 'clipboard', onPress: () => go('tests') },
    {
      key: 'me',
      label: t('student.nav.me'),
      icon: 'user',
      count: unreadCount || undefined,
      onPress: () => go('me'),
    },
  ];
  const bar = <TabBar items={items} active={active} variant={navigation} />;
  return navigation === 'rail' ? { aside: bar } : { footer: bar };
}
