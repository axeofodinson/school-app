// QuestLanguageSwitch — the English/اردو toggle in quest clothes: a pixel
// segmented control (parchment face, green active segment). Same behavior as
// the base LanguageSwitch — each option labels itself in its own script and
// the choice persists via the LanguageProvider.
import { View, Pressable, StyleSheet } from 'react-native';

import Text from '../Text';
import { useLanguage } from '../../i18n/LanguageProvider';
import { t } from '../../i18n';
import { quest, px, spacing } from '../../theme/quest';

const OPTIONS = [
  { locale: 'en', labelKey: 'common.english' },
  { locale: 'ur', labelKey: 'common.urdu' },
];

export default function QuestLanguageSwitch({ style }) {
  const { locale, setLocale } = useLanguage();

  return (
    <View
      style={[styles.group, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.language')}
    >
      {OPTIONS.map((opt) => {
        const active = locale === opt.locale;
        return (
          <Pressable
            key={opt.locale}
            onPress={() => setLocale(opt.locale)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text
              variant="label"
              align="center"
              color={active ? quest.cream : quest.ink}
            >
              {t(opt.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: px.border,
    borderColor: quest.outline,
    borderRadius: px.radius,
    backgroundColor: quest.surface,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    minWidth: 64,
    justifyContent: 'center',
  },
  optionActive: {
    backgroundColor: quest.green,
  },
});
