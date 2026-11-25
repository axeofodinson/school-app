import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { HeroBand, Icon, Reveal, SyncStatusPill, Text, useHeroTone } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { space, type SubjectHue } from '../../ui/tokens';
import { useAttemptSync } from './AttemptSync';

function BackLink() {
  const { t } = useI18n();
  const router = useRouter();
  const tone = useHeroTone();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      accessibilityRole="button"
      accessibilityLabel={t('student.attempt.back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/learn'))}
      style={[styles.back, ring]}
    >
      <Icon name="back" tone={tone} size={22} />
      <Text variant="label" tone={tone}>
        {t('student.attempt.back')}
      </Text>
    </Pressable>
  );
}

/**
 * The compact hero of an inner student page: back, where the work is (sync status,
 * always visible), title and a line under it. Pass it as <Screen header>. Tab roots
 * (`tab`) have no back link. In an exam it renders as a quiet flat band (HeroBand).
 */
export function StudentHeader({
  title,
  subtitle,
  tab = false,
  hue,
}: {
  title: string;
  subtitle?: string;
  tab?: boolean;
  hue?: SubjectHue;
}) {
  const { status, pending, flushNow } = useAttemptSync();
  return (
    <HeroBand compact hue={hue}>
      <HeaderInner title={title} subtitle={subtitle} tab={tab}>
        <SyncStatusPill status={status} pending={pending} onRetry={() => flushNow()} />
      </HeaderInner>
    </HeroBand>
  );
}

function HeaderInner({
  title,
  subtitle,
  tab,
  children,
}: {
  title: string;
  subtitle?: string;
  tab: boolean;
  children: React.ReactNode;
}) {
  const tone = useHeroTone();
  return (
    <>
      <View style={styles.row}>
        {tab ? null : <BackLink />}
        <View style={styles.flex} />
        {children}
      </View>
      <Reveal index={0} rise={8}>
        <Text variant="title" tone={tone} accessibilityRole="header">
          {title}
        </Text>
      </Reveal>
      {subtitle ? (
        <Reveal index={1} rise={6}>
          <Text tone={tone}>{subtitle}</Text>
        </Reveal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingEnd: space.sm,
  },
  flex: { flex: 1 },
});
