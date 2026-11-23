import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import { isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState, LanguageToggle, Screen, Text } from '../../ui';

// Placeholder only: the real student (admission no + PIN, QR) and staff sign-in
// is session 03. The preview links exist so the route groups can be checked.
const previews: { href: Href; label: TKey }[] = [
  { href: '/learn', label: 'student.home.title' },
  { href: '/classes', label: 'teacher.home.title' },
  { href: '/school', label: 'console.home.title' },
  // Same rule as app/dev/gallery.tsx: only where the gallery is turned on.
  ...(__DEV__ || process.env.EXPO_PUBLIC_DEV_GALLERY === '1'
    ? [{ href: '/dev/gallery' as Href, label: 'dev.gallery.title' as TKey }]
    : []),
];

export default function Login() {
  const { t } = useI18n();
  return (
    <Screen>
      <LanguageToggle />
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {t('auth.student.title')}
        </Text>
        <Text>{t('auth.student.subtitle')}</Text>
      </View>
      {isSupabaseConfigured ? null : <Text variant="caption">{t('shell.config.missing')}</Text>}
      <EmptyState
        title={t('shell.login.previewTitle')}
        body={t('shell.login.notReady')}
        action={
          <View style={styles.links}>
            {previews.map((p) => (
              <Link key={p.label} href={p.href} style={styles.link}>
                <Text>{t(p.label)}</Text>
              </Link>
            ))}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  links: { gap: 8, alignItems: 'flex-start' },
  link: { paddingVertical: 8 },
});
