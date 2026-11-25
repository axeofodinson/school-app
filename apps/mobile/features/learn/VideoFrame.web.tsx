// Web: the YouTube (nocookie) player in an iframe, created only after the
// learner presses Play, so opening a lesson never loads anything from YouTube.
import { createElement } from 'react';

export function VideoFrame({ src, title }: { src: string; title: string }) {
  return createElement('iframe', {
    src,
    title,
    allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen',
    allowFullScreen: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    style: { border: 0, width: '100%', height: '100%', display: 'block' },
  });
}

export const opensOutside = false;
