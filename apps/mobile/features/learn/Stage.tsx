// The stage (DESIGN_SYSTEM.md §7b.2): the one place in a lesson where colour is
// strong. A rounded panel with a 2 px ink outline and a light wash of the
// subject hue; diagrams sit on paper-white in both themes (the diagram style is
// ink on white, §7b.3). Under it, always visible: ◀ step dots ▶, Play, Text
// version and Fullscreen, sticker style, ≥ 48 dp (56 for kid).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { IconButton, Text, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { useFocusRing } from '../../ui/Sticker';
import {
  colours as palette,
  diagram,
  radiusFor,
  space,
  subjectHues,
  type SubjectHue,
} from '../../ui/tokens';

export function Stage({
  hue,
  aspect,
  paper = true,
  fullscreen = false,
  label,
  children,
}: {
  hue: SubjectHue;
  /** Width ÷ height; null = as tall as its content (compare panels, text). */
  aspect: number | null;
  /** Diagram paper (white in both themes) vs the hue itself (text stages). */
  paper?: boolean;
  fullscreen?: boolean;
  label: string;
  children: ReactNode;
}) {
  const { colours, scheme, presentation } = useTheme();
  const { height } = useWindowDimensions();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  const r = radiusFor('xl', presentation);
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.stage,
        {
          borderColor: outline,
          borderRadius: r,
          backgroundColor: paper ? palette.light.surface : subjectHues[hue][scheme],
        },
        aspect && !fullscreen
          ? { aspectRatio: aspect, maxHeight: Math.round(height * diagram.stageMaxViewportShare) }
          : null,
        fullscreen ? styles.full : null,
      ]}
    >
      {paper ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: subjectHues[hue].light, opacity: 0.16 },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

/** One step dot: current = long pill in primary, seen = hue, unseen = outline. */
function Dot({
  index,
  current,
  seen,
  hue,
  onPress,
  count,
}: {
  index: number;
  current: boolean;
  seen: boolean;
  hue: SubjectHue;
  onPress: () => void;
  count: number;
}) {
  const { t } = useI18n();
  const { colours, scheme, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const enter = useEnterStyle('selectionChange', current, { scaleFrom: 0.6 });
  const slop = Math.max(0, (p.minTarget - 16) / 2);
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityLabel={t('student.learn.goToStep', { n: index + 1, total: count })}
      accessibilityState={{ selected: current }}
      style={[styles.dotHit, ring]}
    >
      <View
        style={[
          styles.dot,
          {
            borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
            backgroundColor: seen ? subjectHues[hue][scheme] : 'transparent',
          },
        ]}
      />
      {/* The current step grows a primary pill over the dot (transform + opacity only). */}
      <Animated.View
        pointerEvents="none"
        style={[styles.dotNow, { backgroundColor: colours.primary }, enter]}
      />
    </Pressable>
  );
}

export function StageControls({
  step,
  count,
  seen,
  hue,
  onStep,
  playable,
  playing,
  onPlay,
  textMode,
  onTextMode,
  fullscreen,
  onFullscreen,
}: {
  step: number;
  count: number;
  seen: ReadonlySet<number>;
  hue: SubjectHue;
  onStep: (i: number) => void;
  playable: boolean;
  playing: boolean;
  onPlay: () => void;
  textMode: boolean;
  onTextMode: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const { t } = useI18n();
  const many = count > 10;
  return (
    <View style={styles.controls}>
      <IconButton
        icon="chevronStart"
        label={t('student.learn.prev')}
        variant="secondary"
        disabled={step <= 0}
        onPress={() => onStep(step - 1)}
      />
      <View style={styles.dots} accessibilityRole="tablist">
        {many ? (
          <Text variant="label" script="latin" accessibilityLiveRegion="polite">
            {t('student.learn.stepOf', { n: step + 1, total: count })}
          </Text>
        ) : (
          Array.from({ length: count }, (_, i) => (
            <Dot
              key={i}
              index={i}
              count={count}
              current={i === step}
              seen={seen.has(i)}
              hue={hue}
              onPress={() => onStep(i)}
            />
          ))
        )}
      </View>
      <IconButton
        icon="chevronEnd"
        label={t('student.learn.next')}
        variant="secondary"
        disabled={step >= count - 1}
        onPress={() => onStep(step + 1)}
      />
      <View style={styles.flex} />
      {playable ? (
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={t(playing ? 'student.learn.pause' : 'student.learn.play')}
          variant="primary"
          onPress={onPlay}
        />
      ) : null}
      <IconButton
        icon="fileText"
        label={t('student.learn.textVersion')}
        variant="secondary"
        selected={textMode}
        onPress={onTextMode}
      />
      <IconButton
        icon={fullscreen ? 'minimize' : 'maximize'}
        label={t(fullscreen ? 'student.learn.exitFullscreen' : 'student.learn.fullscreen')}
        variant="secondary"
        onPress={onFullscreen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', overflow: 'hidden', borderWidth: 2, alignSelf: 'center' },
  full: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  dotHit: { width: 28, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  dotNow: { position: 'absolute', width: 24, height: 12, borderRadius: 6 },
  flex: { flexGrow: 1 },
});
