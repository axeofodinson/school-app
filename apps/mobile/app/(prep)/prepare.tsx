import { SCHOOL_ONLY_FEATURES, reliefPolicyFor } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { AccountActions } from '../../features/auth/AccountActions';
import { LessonList } from '../../features/learn/LessonList';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { Badge, Card, EmptyState, Icon, Screen, Text } from '../../ui';

// Home for a Google (prep-only) learner. Learn / Practice / Diagnose /
// Follow-ups arrive with prompts 30–42; their gates use automatic relief only
// (reliefPolicyFor('prep_only'): no teacher). School features are not hidden
// silently: one card says what they are and how to get them.
export default function PrepHome() {
  const { t } = useI18n();
  const { profile, tier } = useAuth();
  const relief = reliefPolicyFor(tier);
  const merged = Boolean(profile?.merged_into);

  return (
    <Screen>
      <AccountActions />
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {profile?.full_name
            ? t('prep.home.greeting', { name: profile.full_name })
            : t('prep.home.title')}
        </Text>
        <Badge label={t('prep.home.badge')} tone="primary" icon="book" style={styles.badge} />
      </View>

      {merged ? (
        <Card>
          <View style={styles.row}>
            <Icon name="info" />
            <View style={styles.text}>
              <Text variant="heading">{t('prep.merged.title')}</Text>
              <Text>{t('prep.merged.body')}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <LessonList classId={null} root="/topic" />

      <EmptyState
        icon="lightbulb"
        title={t('prep.home.emptyTitle')}
        body={t(relief.teacherOverrides ? 'prep.home.emptyBody' : 'prep.home.emptyBodyAuto')}
      />

      <Card>
        <View style={styles.row}>
          <Icon name="lock" />
          <View style={styles.text}>
            <Text variant="heading">{t('prep.locked.title')}</Text>
            <Text>{t('prep.locked.body')}</Text>
            <Text tone="textMuted">
              {SCHOOL_ONLY_FEATURES.map((f) => t(`prep.features.${f}`)).join(' · ')}
            </Text>
            <Text tone="textMuted">{t('prep.locked.howTo')}</Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  badge: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 6 },
});
