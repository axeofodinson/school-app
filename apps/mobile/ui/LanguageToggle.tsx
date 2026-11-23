import { Pressable, StyleSheet, View } from 'react-native';

import { LOCALES, useI18n, type Locale } from '../i18n';
import { AppText } from './AppText';

const labelKey = { en: 'common.english', ur: 'common.urdu' } as const satisfies Record<
  Locale,
  string
>;

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.language')}
    >
      {LOCALES.map((l) => {
        const selected = l === locale;
        return (
          <Pressable
            key={l}
            onPress={() => setLocale(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText style={selected ? styles.selectedText : undefined}>{t(labelKey[l])}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#1b1d2a',
  },
  selected: { backgroundColor: '#1b1d2a' },
  selectedText: { color: '#ffffff' },
});
