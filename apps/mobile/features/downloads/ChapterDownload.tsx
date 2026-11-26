// "Save for offline" beside a chapter in the lesson list (prompt 32). Saved
// chapters show their size; saving shows progress in words (nothing moves but
// the button's own press feedback). The Downloads screen manages them.
import { formatBytes } from '@school/core';

import { useI18n } from '../../i18n';
import { Badge, Button, useToast } from '../../ui';
import { usePacks } from './usePacks';

export function ChapterDownload({ chapterId, title }: { chapterId: string; title: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { packs, byChapter, isBusy, download } = usePacks();
  if (!packs) return null;
  const saved = byChapter(chapterId);
  if (isBusy(chapterId)) {
    return <Badge label={t('student.downloads.saving')} tone="neutral" icon="syncing" />;
  }
  if (saved) {
    return (
      <Badge
        label={t('student.downloads.savedSize', { size: formatBytes(saved.bytes) })}
        tone="correct"
        icon="checkCircle"
      />
    );
  }
  return (
    <Button
      title={t('student.downloads.save')}
      icon="cloud"
      size="sm"
      variant="ghost"
      onPress={async () => {
        const r = await download(chapterId);
        toast(
          r.ok
            ? t('student.downloads.saved', {
                chapter: title,
                size: formatBytes(r.data.index.bytes),
              })
            : t(`student.downloads.errors.${r.error}`),
          r.ok ? 'success' : 'warn',
        );
      }}
    />
  );
}
