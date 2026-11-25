// "‹ Back" on a hero band (ink on a subject hue, mirrored in Urdu).
import { Pressable, StyleSheet } from 'react-native';

import { useI18n } from '../../i18n';
import { Icon, Text, useHeroTone } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { space } from '../../ui/tokens';

export function HeaderBack({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  const tone = useHeroTone();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      accessibilityRole="button"
      accessibilityLabel={t('student.learn.backLabel')}
      onPress={onPress}
      hitSlop={8}
      style={[styles.back, ring]}
    >
      <Icon name="back" tone={tone} size={22} />
      <Text variant="label" tone={tone}>
        {t('student.learn.back')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingEnd: space.sm,
  },
});
