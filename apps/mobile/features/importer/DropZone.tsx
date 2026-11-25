// The drop zone: one card the teacher drops a topic file onto, or taps to
// browse. The border is a dashed outline that thickens while a file hovers;
// nothing else moves (DESIGN_SYSTEM §3 staff presentation, lite motion).
import { useEffect, useRef, useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Icon, Text, useTheme } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';

import { CAN_DROP, pickJsonFile, type PickedFile } from './pickFile';

export function DropZone({
  busy,
  fileName,
  onFile,
  onError,
}: {
  busy: boolean;
  fileName: string | null;
  onFile: (f: PickedFile) => void;
  onError: () => void;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const { focusProps, ring } = useFocusRing();

  const browse = async () => {
    try {
      const picked = await pickJsonFile();
      if (picked) onFile(picked);
    } catch {
      onError();
    }
  };

  // Web only: a dragged file. react-native-web doesn't forward drag props, so
  // the listeners go on the DOM node itself.
  const host = useRef<unknown>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!CAN_DROP || Platform.OS !== 'web') return;
    const node = host.current as unknown as HTMLElement | null;
    if (!node) return;
    const stop = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const leave = () => setOver(false);
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const { readFile } = await import('./pickFile.web');
        onFile(await readFile(file));
      } catch {
        onError();
      }
    };
    node.addEventListener('dragover', stop);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', stop);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [onFile, onError]);

  return (
    <Pressable
      ref={host as Ref<never>}
      {...focusProps}
      onPress={browse}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={t('staff.importer.drop.title')}
      accessibilityHint={t('staff.importer.drop.hint')}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.zone,
        {
          borderColor: over || pressed || hovered ? colours.primary : colours.borderStrong,
          backgroundColor: over || pressed || hovered ? colours.primarySoft : colours.surfaceAlt,
          opacity: busy ? 0.6 : 1,
        },
        ring,
      ]}
    >
      <Icon name="upload" size={28} colour={colours.primary} />
      <Text variant="label">
        {t(CAN_DROP ? 'staff.importer.drop.title' : 'staff.importer.drop.titleNative')}
      </Text>
      <Text tone="textMuted" variant="bodySm" style={styles.centre}>
        {t('staff.importer.drop.hint')}
      </Text>
      {fileName ? (
        <View style={styles.file}>
          <Icon name="book" size={16} colour={colours.textMuted} />
          <Text variant="bodySm" tone="textMuted" script="latin">
            {fileName}
          </Text>
        </View>
      ) : null}
      <Button
        title={t('staff.importer.drop.browse')}
        variant="secondary"
        size="sm"
        onPress={browse}
        disabled={busy}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: strokeWidth.sticker,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  centre: { textAlign: 'center' },
  file: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
});
