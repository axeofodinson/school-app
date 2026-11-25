// Android: no WebView module in the app (it would need a new native build, and
// YouTube's own player is better on a phone), so Play opens the video in the
// YouTube app or a browser tab. The poster stays on the stage (DECISIONS #113).
export function VideoFrame(_: { src: string; title: string }) {
  return null;
}

export const opensOutside = true;
