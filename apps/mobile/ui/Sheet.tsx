import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { IconButton } from './IconButton';
import { useLayout } from './layout';
import { useEnterStyle } from './motion';
import { Text } from './Text';
import { useTheme } from './theme';
import { elevation, radiusFor, space } from './tokens';

/**
 * A modal sheet: bottom sheet on phones, centred dialog from tablet width up.
 * Closes with the close button, Android back and Esc on web (Modal onRequestClose),
 * or a tap on the scrim. Enters with the `sheetPresent` moment; closing is instant.
 * (RN Modal, not @expo/ui BottomSheet: we need web + Android with one look.)
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {visible ? (
        <SheetBody onClose={onClose} title={title} footer={footer}>
          {children}
        </SheetBody>
      ) : null}
    </Modal>
  );
}

function SheetBody({
  onClose,
  title,
  children,
  footer,
}: {
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t, isRTL } = useI18n();
  const { colours, scheme, presentation } = useTheme();
  const { breakpoint } = useLayout();
  const insets = useSafeAreaInsets();
  const dialog = breakpoint !== 'phone';
  const scrim = useEnterStyle('sheetPresent', true);
  const panel = useEnterStyle('sheetPresent', true, { translateY: 24 });
  const r = radiusFor('xl', presentation);

  return (
    <View
      style={[
        styles.root,
        dialog ? styles.center : styles.bottom,
        { direction: isRTL ? 'rtl' : 'ltr' },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colours.scrim }, scrim]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('ui.close')}
          accessibilityRole="button"
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        role="dialog"
        aria-modal
        aria-label={title}
        style={[
          styles.panel,
          {
            backgroundColor: colours.surface,
            borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
            boxShadow: scheme === 'light' ? elevation.overlay.light : undefined,
          },
          dialog
            ? { borderRadius: r, maxWidth: 560 }
            : {
                borderTopStartRadius: r,
                borderTopEndRadius: r,
                paddingBottom: insets.bottom + space.lg,
              },
          panel,
        ]}
      >
        <View style={styles.header}>
          <Text variant="heading" accessibilityRole="header" style={styles.flex}>
            {title}
          </Text>
          <IconButton icon="close" label={t('ui.close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bottom: { justifyContent: 'flex-end' },
  center: { justifyContent: 'center', alignItems: 'center', padding: space.xl },
  panel: { width: '100%', maxHeight: '90%', borderWidth: 2, paddingTop: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingStart: space.xl,
    paddingEnd: space.sm,
  },
  content: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.sm },
  flex: { flex: 1 },
});
