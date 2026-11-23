import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import { isSupabaseConfigured } from '../../lib/supabase';
import { AppText } from '../../ui/AppText';
import { EmptyState } from '../../ui/EmptyState';
import { LanguageToggle } from '../../ui/LanguageToggle';
import { Screen } from '../../ui/Screen';

// Placeholder only: the real student (admission no + PIN, QR) and staff sign-in
// is session 03. The preview links exist so the route groups can be checked.
const previews: { href: Href; label: TKey }[] = [
  { href: '/learn', label: 'student.home.title' },
  { href: '/classes', label: 'teacher.home.title' },
  { href: '/school', label: 'console.home.title' },
];

export default function Login() {
  const { t } = useI18n();
  return (
    <Screen>
      <LanguageToggle />
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('auth.student.title')}
        </AppText>
        <AppText>{t('auth.student.subtitle')}</AppText>
      </View>
      {isSupabaseConfigured ? null : (
        <AppText variant="caption">{t('shell.config.missing')}</AppText>
      )}
      <EmptyState
        title={t('shell.login.previewTitle')}
        body={t('shell.login.notReady')}
        action={
          <View style={styles.links}>
            {previews.map((p) => (
              <Link key={p.label} href={p.href} style={styles.link}>
                <AppText>{t(p.label)}</AppText>
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
