// File assessment viewer — opens a worksheet the teacher uploaded (image, markdown,
// or another document) for the signed-in student's class. The file lives in the
// private `assessment-files` bucket (db/014); we mint a signed URL, and RLS on the
// storage object is what actually gates access — a student in another class simply
// can't create the URL, so this screen shows an honest error rather than the file.
//
// Rendering by kind:
//   * image → shown inline, full width; tap opens it full-screen in the system
//     viewer (pinch-zoom lives there; not required for v1).
//   * markdown → parsed by the vendored parser and drawn formatted (bilingual +
//     RTL via <Markdown>), never as raw text.
//   * anything else (PDF, doc…) → an "Open file" button that hands the signed URL
//     to the OS, so we don't pull a heavy in-app viewer dependency.
//
// Offline: file bytes aren't pre-cached (images are heavy; the attempt cache holds
// only light question JSON), so opening needs a connection — a dropped load falls
// back to a clear retry, never a frozen screen (CLAUDE.md).
import { useCallback, useEffect, useState } from 'react';
import { View, Image, Pressable, Linking, StyleSheet } from 'react-native';

import { Text } from '../../components';
import Markdown from '../../components/Markdown';
import {
  QuestScreen,
  QuestHeader,
  QuestPanel,
  QuestButton,
  QuestLoading,
  QuestEmpty,
} from '../../components/quest';
import { supabase } from '../../lib/supabase';
import { parseMarkdown } from '../../markdown/parse';
import { t } from '../../i18n';
import { quest, spacing } from '../../theme/quest';

// How long a minted URL stays valid — long enough to read a worksheet, short
// enough that a leaked link doesn't live forever.
const SIGNED_URL_TTL = 60 * 60; // 1 hour

// Decide how to render from the stored mime type, falling back to the file
// extension (some pickers report a generic mime).
function fileKind(mime, path) {
  const m = (mime || '').toLowerCase();
  const ext = (path || '').toLowerCase().split('.').pop();
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (m.includes('markdown') || m === 'text/x-markdown' || ext === 'md' || ext === 'markdown') {
    return 'markdown';
  }
  return 'other';
}

function classifyError(error) {
  const msg = (error?.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

export default function FileAssessmentScreen({ assessment, onBack }) {
  const filePath = assessment?.file_path ?? null;
  const kind = fileKind(assessment?.file_mime, filePath || assessment?.file_name);

  const [url, setUrl] = useState(null);
  const [mdBlocks, setMdBlocks] = useState(null); // parsed markdown, when kind==='markdown'
  const [aspect, setAspect] = useState(1.4); // image width/height, refined on load
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);
    setMdBlocks(null);

    if (!filePath) {
      setLoaded(true);
      return;
    }

    // Minting the URL is itself RLS-checked (db/014): no access → no URL.
    const { data, error } = await supabase.storage
      .from('assessment-files')
      .createSignedUrl(filePath, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) {
      setErrorKey(error ? classifyError(error) : 'unknown');
      setLoaded(true);
      return;
    }
    const signedUrl = data.signedUrl;
    setUrl(signedUrl);

    if (kind === 'image') {
      // Fetch the natural size so the inline image keeps its aspect ratio.
      Image.getSize(
        signedUrl,
        (w, h) => {
          if (w > 0 && h > 0) setAspect(w / h);
        },
        () => {}
      );
      setLoaded(true);
      return;
    }

    if (kind === 'markdown') {
      try {
        const res = await fetch(signedUrl);
        const text = await res.text();
        setMdBlocks(parseMarkdown(text));
      } catch (e) {
        setErrorKey(classifyError(e));
      }
      setLoaded(true);
      return;
    }

    setLoaded(true);
  }, [filePath, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const openExternally = useCallback(() => {
    if (url) Linking.openURL(url).catch(() => {});
  }, [url]);

  const header = (
    <QuestHeader
      title={assessment?.title ?? ''}
      subtitle={
        assessment?.subject?.name
          ? `${t('student.assessments.worksheet')} · ${assessment.subject.name}`
          : t('student.assessments.worksheet')
      }
      backLabel={t('student.fileAssessment.back')}
      onBack={onBack}
    />
  );

  if (!loaded) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="scroll" />
      </QuestScreen>
    );
  }

  if (!filePath) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.fileAssessment.noFile')} />
      </QuestScreen>
    );
  }

  if (errorKey) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t(`student.fileAssessment.errors.${errorKey}`)}
          tone="danger"
          actionLabel={t('student.fileAssessment.retry')}
          onAction={load}
        />
      </QuestScreen>
    );
  }

  return (
    <QuestScreen scroll>
      {header}
      {kind === 'image' ? (
        <QuestPanel style={styles.panel}>
          <Pressable onPress={openExternally} accessibilityRole="imagebutton">
            <Image
              source={{ uri: url }}
              style={[styles.image, { aspectRatio: aspect }]}
              resizeMode="contain"
            />
          </Pressable>
          <Text variant="caption" color={quest.faint} style={styles.hint}>
            {t('student.fileAssessment.tapToOpen')}
          </Text>
        </QuestPanel>
      ) : kind === 'markdown' ? (
        <QuestPanel style={styles.panel}>
          <Markdown blocks={mdBlocks ?? []} />
        </QuestPanel>
      ) : (
        <QuestPanel style={styles.panel} faceStyle={styles.otherFace}>
          <Text variant="body" color={quest.ink} style={styles.fileName}>
            {assessment?.file_name ?? ''}
          </Text>
          <QuestButton
            label={t('student.fileAssessment.open')}
            onPress={openExternally}
            style={styles.openBtn}
          />
        </QuestPanel>
      )}
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg },
  image: { width: '100%', height: undefined, borderRadius: 8 },
  hint: { marginTop: spacing.sm },
  otherFace: { alignItems: 'center' },
  fileName: { marginBottom: spacing.md },
  openBtn: { minWidth: 160 },
});
