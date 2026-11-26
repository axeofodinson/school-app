// Downloads (prompt 32): the chapters this learner saved for offline use on
// this device, their size and when they were last updated, Update (only what
// changed comes down) and Delete. Video always needs internet; its fallback
// picture is in the pack.
import { formatBytes, type PackIndex } from '@school/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HeroBand,
  Reveal,
  Screen,
  Sheet,
  SkeletonLines,
  Text,
  useHeroTone,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { HeaderBack } from '../learn/HeaderBack';
import { useOnline } from '../learn/useOnline';
import { usePacks } from './usePacks';

function Header({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const tone = useHeroTone();
  return (
    <View style={styles.header}>
      <HeaderBack onPress={onBack} />
      <Text variant="title" tone={tone} accessibilityRole="header">
        {t('student.downloads.title')}
      </Text>
      <Text tone={tone}>{t('student.downloads.subtitle')}</Text>
    </View>
  );
}

export function DownloadsScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline(false);
  const { packs, isBusy, download, remove, refreshStale } = usePacks();
  const [deleting, setDeleting] = useState<PackIndex | null>(null);
  const ur = locale === 'ur';
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      numberingSystem: 'latn',
    });

  const loaded = !!packs;
  useEffect(() => {
    if (loaded && online) void refreshStale();
  }, [loaded, online, refreshStale]);

  const total = (packs ?? []).reduce((n, p) => n + p.bytes, 0);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen
      header={
        <HeroBand compact>
          <Header onBack={back} />
        </HeroBand>
      }
    >
      {!packs ? <SkeletonLines lines={3} /> : null}
      {packs && !packs.length ? (
        <EmptyState
          icon="cloud"
          title={t('student.downloads.empty')}
          body={t('student.downloads.emptyBody')}
        />
      ) : null}
      {packs && packs.length ? (
        <Text variant="label" tone="textMuted">
          {t('student.downloads.total', { count: packs.length, size: formatBytes(total) })}
        </Text>
      ) : null}
      {(packs ?? []).map((p, i) => {
        const busy = isBusy(p.chapter.id);
        const title = (ur ? p.chapter.titleUr : null) || p.chapter.title;
        return (
          <Reveal key={p.chapter.id} index={Math.min(i + 1, 8)}>
            <Card>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
                    {[p.chapter.className, p.chapter.subjectName].filter(Boolean).join(' · ')}
                  </Text>
                  <Text variant="bodySm" tone="textMuted">
                    {t('student.downloads.counts', {
                      lessons: p.lessons.length,
                      questions: p.questions.length,
                    })}
                  </Text>
                </View>
                <Badge label={formatBytes(p.bytes)} tone="neutral" />
              </View>
              <Text variant="caption" tone="textMuted">
                {busy
                  ? t('student.downloads.saving')
                  : t('student.downloads.updated', { date: date(p.savedAt) })}
              </Text>
              <View style={styles.actions}>
                <Button
                  title={t('student.downloads.update')}
                  icon="replay"
                  size="sm"
                  variant="secondary"
                  disabled={busy || !online}
                  onPress={async () => {
                    const r = await download(p.chapter.id);
                    toast(
                      r.ok
                        ? t('student.downloads.updatedToast', {
                            chapter: title,
                            size: formatBytes(r.data.transferred),
                          })
                        : t(`student.downloads.errors.${r.error}`),
                      r.ok ? 'success' : 'warn',
                    );
                  }}
                />
                <Button
                  title={t('student.downloads.delete')}
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setDeleting(p)}
                />
              </View>
            </Card>
          </Reveal>
        );
      })}
      {packs && packs.length ? (
        <Text variant="bodySm" tone="textMuted">
          {t('student.downloads.videoNote')}
        </Text>
      ) : null}
      <Sheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('student.downloads.deleteTitle')}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('student.downloads.keep')}
              variant="ghost"
              onPress={() => setDeleting(null)}
            />
            <Button
              title={t('student.downloads.delete')}
              variant="danger"
              onPress={async () => {
                const p = deleting;
                setDeleting(null);
                if (p) {
                  await remove(p.chapter.id);
                  toast(t('student.downloads.deleted'), 'success');
                }
              }}
            />
          </View>
        }
      >
        <Text>
          {t('student.downloads.deleteBody', {
            chapter: deleting
              ? (ur ? deleting.chapter.titleUr : null) || deleting.chapter.title
              : '',
          })}
        </Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
