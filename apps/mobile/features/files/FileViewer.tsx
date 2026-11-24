// Shows one worksheet file: images inline (tap opens full size), markdown drawn
// as formatted text, anything else (PDF, Word…) behind an "Open file" button
// that hands a signed URL to the browser / OS. Needs a connection: the file
// bytes are not cached on the device (images are heavy); a failed load says so
// and offers Retry, never a frozen screen.
import { fileKind } from '@school/core';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, EmptyState, SkeletonLines, Text } from '../../ui';
import { radius, space } from '../../ui/tokens';
import { useResult } from '../scope/useResult';
import { loadWorksheet } from './api';
import { MarkdownView } from './MarkdownView';

export interface WorksheetFile {
  path: string | null;
  name: string | null;
  mime: string | null;
}

export function FileViewer({ file }: { file: WorksheetFile }) {
  const { t } = useI18n();
  const kind = fileKind(file.mime, file.name ?? file.path);
  const path = file.path;
  const res = useResult(path ? `f:${path}` : null, () => loadWorksheet(path!, kind));
  const [aspect, setAspect] = useState(1.4);
  const url = res.state?.status === 'ready' ? res.state.data.url : null;
  useEffect(() => {
    if (!url || kind !== 'image') return;
    Image.getSize(
      url,
      (w, h) => w > 0 && h > 0 && setAspect(w / h),
      () => undefined,
    );
  }, [url, kind]);

  if (!path) {
    return <EmptyState icon="book" title={t('student.fileAssessment.noFile')} />;
  }
  if (!res.state || res.state.status === 'loading') {
    return (
      <View style={styles.wrap}>
        <Text tone="textMuted">{t('student.fileAssessment.loading')}</Text>
        <SkeletonLines lines={4} />
      </View>
    );
  }
  if (res.state.status === 'error') {
    return (
      <EmptyState
        icon="cloudOff"
        title={t(
          res.state.error === 'network'
            ? 'student.fileAssessment.errors.network'
            : 'student.fileAssessment.errors.unknown',
        )}
        action={
          <Button
            title={t('student.fileAssessment.retry')}
            variant="secondary"
            onPress={res.reload}
          />
        }
      />
    );
  }
  const { url: signed, text } = res.state.data;
  const open = () => Linking.openURL(signed).catch(() => undefined);

  if (kind === 'image') {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={open}
          accessibilityRole="imagebutton"
          accessibilityLabel={file.name ?? t('student.assessments.worksheet')}
          accessibilityHint={t('student.fileAssessment.tapToOpen')}
        >
          <Image
            source={{ uri: signed }}
            style={[styles.image, { aspectRatio: aspect }]}
            resizeMode="contain"
          />
        </Pressable>
        <Text variant="caption" tone="textMuted">
          {t('student.fileAssessment.tapToOpen')}
        </Text>
      </View>
    );
  }
  if (kind === 'markdown' && text != null) {
    return <MarkdownView source={text} />;
  }
  return (
    <View style={styles.wrap}>
      {file.name ? <Text>{file.name}</Text> : null}
      <Button
        title={t('student.fileAssessment.open')}
        icon="forward"
        onPress={open}
        style={styles.start}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  image: { width: '100%', borderRadius: radius.md },
  start: { alignSelf: 'flex-start' },
});
