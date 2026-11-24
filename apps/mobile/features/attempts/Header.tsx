import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, SyncStatusPill, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { useAttemptSync } from './AttemptSync';

/** Back + title + where the student's work is (sync status, always visible). */
export function StudentHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { status, pending, flushNow } = useAttemptSync();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Button
          title={t('student.attempt.back')}
          icon="back"
          variant="ghost"
          size="sm"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/learn'))}
        />
        <View style={styles.flex} />
        <SyncStatusPill status={status} pending={pending} onRetry={() => flushNow()} />
      </View>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text tone="textMuted">{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
