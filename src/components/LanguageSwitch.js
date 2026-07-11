// Language switch — a small segmented control to toggle English <-> Urdu at
// runtime. Each option is labelled in its own language (English shown as
// "English", Urdu as "اردو") so it reads the same whichever way the UI is set.
// The choice is applied and persisted through the LanguageProvider.
import { View, Pressable, StyleSheet } from 'react-native';

import Text from './Text';
import { useLanguage } from '../i18n/LanguageProvider';
import { t } from '../i18n';
import { colors, spacing } from '../theme/colors';

// Each option renders its own label in its own script (a locale key that holds
// the same value in both en.json and ur.json), so it self-identifies.
const OPTIONS = [
  { locale: 'en', labelKey: 'common.english' },
  { locale: 'ur', labelKey: 'common.urdu' },
];

export default function LanguageSwitch({ style }) {
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
              color={active ? colors.primaryText : colors.primary}
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
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    minWidth: 64,
    backgroundColor: colors.bg,
  },
  optionActive: {
    backgroundColor: colors.primary,
  },
});
