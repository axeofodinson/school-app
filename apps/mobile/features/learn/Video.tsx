// The `video` block (DESIGN_SYSTEM.md §7b.1): a poster on the stage until the
// learner presses Play (no autoplay, nothing loads from YouTube before that).
// Web plays the nocookie embed in place; Android opens YouTube. Offline, the
// stage shows "needs internet" and the block's offline fallback (a scene from
// prompt 33, or any visual) instead.
import {
  videoFallback,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  type LessonBlock,
  type LessonLang,
} from '@school/core';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Icon, Text, useTheme } from '../../ui';
import { PatternFill } from '../../ui/Pattern';
import { PressableSticker } from '../../ui/Sticker';
import { colours as palette, diagram, radius, space } from '../../ui/tokens';
import { VideoFrame, opensOutside } from './VideoFrame';
import { StageVisual } from './StageVisual';
import { LaterVisual } from './visuals';

export async function openVideo(block: LessonBlock): Promise<boolean> {
  const url = youtubeWatchUrl(block.youtube_id);
  if (!url) return false;
  await WebBrowser.openBrowserAsync(url).catch(() => undefined);
  return true;
}

export function VideoView({
  block,
  blocks,
  lang,
  online,
  playing,
  onPlay,
}: {
  block: LessonBlock;
  blocks: unknown[];
  lang: LessonLang;
  online: boolean;
  /** Web: the player is on the stage. */
  playing: boolean;
  onPlay: () => void;
}) {
  const { t } = useI18n();
  const { p } = useTheme();
  const embed = youtubeEmbedUrl(block.youtube_id, lang);

  if (!online) {
    const fb = videoFallback(blocks, block);
    return (
      <View style={styles.fill}>
        <View style={styles.offlineBar}>
          <Badge label={t('student.learn.videoOffline')} tone="weak" icon="cloudOff" />
        </View>
        <View style={styles.fill}>
          {fb ? (
            <StageVisual block={fb} lang={lang} />
          ) : (
            <LaterVisual
              block={block}
              lang={lang}
              icon="cloudOff"
              title={t('student.learn.videoNeedsInternet')}
            />
          )}
        </View>
      </View>
    );
  }
  if (playing && embed && !opensOutside) {
    return <VideoFrame src={`${embed}&autoplay=1`} title={t('student.learn.video')} />;
  }
  const size = Math.max(72, p.minTarget + 24);
  return (
    <View style={[styles.fill, styles.poster]}>
      <PatternFill name="chevron" colour={palette.light.onPrimary} />
      <PressableSticker
        onPress={onPlay}
        disabled={!embed}
        radius={size / 2}
        accessibilityRole="button"
        accessibilityLabel={t('student.learn.playVideo')}
        faceStyle={() => [
          styles.play,
          { width: size, height: size, backgroundColor: palette.light.accent },
        ]}
      >
        <Icon name="play" size={size / 2.4} colour={diagram.ink} />
      </PressableSticker>
      <Text variant="label" style={styles.posterText}>
        {embed
          ? t(opensOutside ? 'student.learn.opensYoutube' : 'student.learn.video')
          : t('student.learn.videoMissing')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  poster: {
    backgroundColor: diagram.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    overflow: 'hidden',
  },
  play: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: diagram.ink,
  },
  posterText: {
    color: palette.light.onPrimary,
    backgroundColor: palette.light.scrim,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.full,
  },
  offlineBar: { padding: space.sm, alignItems: 'flex-start' },
});
