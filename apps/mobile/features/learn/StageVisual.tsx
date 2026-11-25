// One renderer per visual block type (DESIGN_SYSTEM.md §7b.1), shared by the
// lesson reader, a video's offline fallback and the gallery. Video is handled
// by the reader itself (it needs the online state and the block list).
import type { LessonBlock, LessonLang } from '@school/core';

import { ChartView } from './ChartView';
import { SceneView } from './SceneView';
import { CompareView, FigureView, LaterVisual } from './visuals';
import { WidgetHost } from './widgets/WidgetHost';

export function StageVisual({
  block,
  lang,
  predictReady = false,
  showCaption = false,
}: {
  block: LessonBlock;
  lang: LessonLang;
  predictReady?: boolean;
  showCaption?: boolean;
}) {
  switch (block.type) {
    case 'figure':
      return <FigureView block={block} lang={lang} />;
    case 'compare':
      return <CompareView block={block} lang={lang} />;
    case 'scene':
      return (
        <SceneView
          block={block}
          lang={lang}
          predictReady={predictReady}
          showCaption={showCaption}
        />
      );
    case 'chart':
      return <ChartView block={block} lang={lang} />;
    case 'widget':
      return <WidgetHost block={block} lang={lang} predictReady={predictReady} />;
    default:
      return <LaterVisual block={block} lang={lang} />;
  }
}
