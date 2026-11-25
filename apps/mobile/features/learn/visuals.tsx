// Renderers for the visual blocks of prompt 30 (DESIGN_SYSTEM.md §7b.1):
// figure (SVG + numbered hotspots, pinch/drag or ± zoom), compare (two panels),
// a text stage for sections without a visual, and a placeholder for scene,
// chart, widget and lottie (prompt 33), which still shows everything they say
// as text so nothing is lost. Lesson visuals move by transform + opacity only.
import {
  fitBox,
  pickLang,
  plainLabel,
  svgAspect,
  visualText,
  type LessonBlock,
  type LessonLang,
} from '@school/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { useI18n } from '../../i18n';
import { Badge, Icon, IconButton, Text, useTheme, type IconName } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { PatternFill } from '../../ui/Pattern';
import { useFocusRing } from '../../ui/Sticker';
import { colours as palette, diagram, radius, space } from '../../ui/tokens';
import { LessonText } from './LessonText';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ink = diagram.ink;

// ───────────────────────────── figure ─────────────────────────────

const MAX_ZOOM = 4;

function Hotspot({
  n,
  label,
  open,
  below,
  onToggle,
}: {
  n: number;
  label: string;
  open: boolean;
  below: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const { p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const pop = useEnterStyle('hotspotReveal', open, { scaleFrom: 0.8, translateY: below ? -6 : 6 });
  const slop = Math.max(0, (p.minTarget - 32) / 2);
  return (
    <View style={styles.hotspotAnchor} pointerEvents="box-none">
      <Pressable
        {...focusProps}
        onPress={onToggle}
        hitSlop={slop}
        accessibilityRole="button"
        accessibilityLabel={t('student.learn.hotspot', { n, label })}
        accessibilityState={{ expanded: open }}
        style={[
          styles.hotspot,
          { backgroundColor: open ? palette.light.accent : palette.light.primary },
          ring,
        ]}
      >
        <Text
          variant="label"
          script="latin"
          style={{ color: open ? ink : palette.light.onPrimary }}
        >
          {String(n)}
        </Text>
      </Pressable>
      {open ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.bubble, below ? styles.bubbleBelow : styles.bubbleAbove, pop]}
        >
          <Text variant="label" style={{ color: ink }}>
            {label}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function FigureView({ block, lang }: { block: LessonBlock; lang: LessonLang }) {
  const { t } = useI18n();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [open, setOpen] = useState<number | null>(null);
  const svg = typeof block.svg === 'string' ? block.svg : null;
  const aspect = svg ? svgAspect(svg) : 1;
  const fit = fitBox(box.w, box.h, aspect);
  const hotspots = (Array.isArray(block.hotspots) ? block.hotspots : []).filter(isObj);

  // Pinch / drag to zoom (direct manipulation: follows the finger, no easing).
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });
  const clampPan = (s: number) => {
    'worklet';
    const mx = ((s - 1) * fit.width) / 2;
    const my = ((s - 1) * fit.height) / 2;
    tx.set(Math.min(mx, Math.max(-mx, tx.get())));
    ty.set(Math.min(my, Math.max(-my, ty.get())));
  };
  const pinch = Gesture.Pinch()
    .onStart(() => {
      saved.set(scale.get());
    })
    .onUpdate((e) => {
      scale.set(Math.min(MAX_ZOOM, Math.max(1, saved.get() * e.scale)));
      clampPan(scale.get());
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onStart(() => {
      start.set({ x: tx.get(), y: ty.get() });
    })
    .onUpdate((e) => {
      if (scale.get() <= 1) return;
      tx.set(start.get().x + e.translationX);
      ty.set(start.get().y + e.translationY);
      clampPan(scale.get());
    });
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));
  const zoomBy = (d: number) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, Math.round((scale.get() + d) * 2) / 2));
    scale.set(s);
    if (s === 1) {
      tx.set(0);
      ty.set(0);
    } else clampPan(s);
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  if (!svg) {
    // A raster figure (teacher upload) needs the lesson-media bucket (prompt 32/33).
    return (
      <LaterVisual block={block} lang={lang} icon="image" title={t('student.learn.picture')} />
    );
  }
  return (
    <View style={styles.fill} onLayout={onLayout}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
        <View style={styles.fill} collapsable={false}>
          {fit.width > 0 ? (
            <Animated.View
              style={[
                styles.abs,
                { left: fit.left, top: fit.top, width: fit.width, height: fit.height },
                zoomStyle,
              ]}
            >
              <SvgXml xml={svg} width={fit.width} height={fit.height} />
              {hotspots.map((h, i) => {
                const label = pickLang(h.label, lang)?.text ?? '';
                const x = Number(h.x);
                const y = Number(h.y);
                return (
                  <View
                    key={i}
                    pointerEvents="box-none"
                    style={[styles.abs, { left: x * fit.width, top: y * fit.height }]}
                  >
                    <Hotspot
                      n={i + 1}
                      label={label}
                      open={open === i}
                      below={y < 0.5}
                      onToggle={() => setOpen(open === i ? null : i)}
                    />
                  </View>
                );
              })}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.zoomBar}>
        <IconButton
          icon="zoomOut"
          label={t('student.learn.zoomOut')}
          variant="secondary"
          onPress={() => zoomBy(-0.5)}
        />
        <IconButton
          icon="zoomIn"
          label={t('student.learn.zoomIn')}
          variant="secondary"
          onPress={() => zoomBy(0.5)}
        />
      </View>
    </View>
  );
}

// ───────────────────────────── compare ─────────────────────────────

const TONES = {
  wrong_idea: {
    bg: palette.light.wrongSoft,
    fg: palette.light.onWrongSoft,
    icon: 'close',
    key: 'wrongIdea',
  },
  result: {
    bg: palette.light.correctSoft,
    fg: palette.light.onCorrectSoft,
    icon: 'check',
    key: 'rightIdea',
  },
} as const;

export function CompareView({ block, lang }: { block: LessonBlock; lang: LessonLang }) {
  const { t } = useI18n();
  const [w, setW] = useState(0);
  const sideBySide = w >= 520;
  return (
    <View
      style={[styles.compare, { flexDirection: sideBySide ? 'row' : 'column' }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {(['left', 'right'] as const).map((side) => {
        const s = isObj(block[side]) ? (block[side] as Obj) : {};
        const tone = TONES[s.tone as keyof typeof TONES] ?? null;
        const title = pickLang(s.title, lang)?.text ?? '';
        const text = pickLang(s.text, lang)?.text ?? '';
        const svg = typeof s.svg === 'string' ? s.svg : null;
        return (
          <View
            key={side}
            style={[
              styles.panel,
              { backgroundColor: tone?.bg ?? palette.light.surface, borderColor: ink },
            ]}
          >
            <View style={styles.panelHead}>
              {tone ? (
                <View style={[styles.toneIcon, { backgroundColor: tone.fg }]}>
                  <Icon name={tone.icon} size={16} colour={palette.light.onPrimary} />
                </View>
              ) : null}
              <View style={styles.flex}>
                {tone ? (
                  <Text variant="caption" style={{ color: tone.fg }}>
                    {t(`student.learn.${tone.key}`)}
                  </Text>
                ) : null}
                <Text variant="heading" style={{ color: ink }}>
                  {title}
                </Text>
              </View>
            </View>
            {svg ? (
              <View style={[styles.panelArt, { aspectRatio: svgAspect(svg) }]}>
                <SvgXml xml={svg} width="100%" height="100%" />
              </View>
            ) : null}
            {text ? <LessonText source={text} tone="ink" /> : null}
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────────── text stage ─────────────────────────────

/** A section without a visual: its number and title on the hue, the Mosaic pattern behind. */
export function TextStage({ n, title, summary }: { n: number; title: string; summary: boolean }) {
  const { t } = useI18n();
  const { colours, scheme } = useTheme();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View style={styles.textStage}>
      <PatternFill name={summary ? 'hexFlower' : 'star8'} colour={colours.ink} />
      <View style={[styles.textCard, { backgroundColor: colours.surface, borderColor: outline }]}>
        <View style={[styles.stepTile, { backgroundColor: colours.accent, borderColor: outline }]}>
          {summary ? (
            <Icon name="star" size={22} colour={colours.onAccent} />
          ) : (
            <Text variant="heading" script="latin" tone="onAccent">
              {String(n)}
            </Text>
          )}
        </View>
        <Text variant="heading" style={styles.flex} numberOfLines={3}>
          {summary ? t('student.learn.summary') : title}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────────────── placeholder (prompt 33) ─────────────────────────────

const LATER: Record<string, { icon: IconName; key: 'scene' | 'chart' | 'widget' | 'lottie' }> = {
  scene: { icon: 'play', key: 'scene' },
  chart: { icon: 'chart', key: 'chart' },
  widget: { icon: 'sliders', key: 'widget' },
  lottie: { icon: 'sparkles', key: 'lottie' },
};

export function LaterVisual({
  block,
  lang,
  icon,
  title,
}: {
  block: LessonBlock;
  lang: LessonLang;
  icon?: IconName;
  title?: string;
}) {
  const { t } = useI18n();
  const kind = LATER[block.type];
  const lines = visualText(block, lang);
  const alt = lines.find((l) => l.kind === 'alt')?.text;
  return (
    <View style={styles.later}>
      <View style={[styles.laterIcon, { borderColor: ink, backgroundColor: palette.light.accent }]}>
        <Icon name={icon ?? kind?.icon ?? 'layers'} size={28} colour={ink} />
      </View>
      <Text variant="heading" style={[styles.centre, { color: ink }]}>
        {title ?? (kind ? t(`student.learn.later.${kind.key}`) : t('student.learn.picture'))}
      </Text>
      <Badge label={t('student.learn.comingSoon')} tone="accent" icon="clock" />
      {alt ? (
        <Text
          variant="bodySm"
          style={[styles.centre, { color: palette.light.textMuted }]}
          numberOfLines={4}
        >
          {plainLabel(alt, 220)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  abs: { position: 'absolute' },
  centre: { textAlign: 'center' },
  hotspotAnchor: { position: 'absolute', left: -16, top: -16, width: 32, height: 32 },
  hotspot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    start: -40,
    minWidth: 112,
    maxWidth: 220,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: ink,
    backgroundColor: palette.light.surface,
  },
  bubbleBelow: { top: 40 },
  bubbleAbove: { bottom: 40 },
  zoomBar: {
    position: 'absolute',
    bottom: space.sm,
    end: space.sm,
    flexDirection: 'row',
    gap: space.xs,
  },
  compare: { gap: space.md, padding: space.md },
  panel: { flex: 1, gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 2 },
  panelHead: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  toneIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelArt: { width: '100%', maxHeight: 220 },
  textStage: { minHeight: 150, justifyContent: 'center', padding: space.xl, overflow: 'hidden' },
  textCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  stepTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  later: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  laterIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
});
