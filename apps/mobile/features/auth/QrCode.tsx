import { qrPath } from '@school/core';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { qrMatrix } from './qr-matrix';

/** On-screen QR (black on white with the 4-module quiet zone, in both themes). */
export function QrCode({ value, size = 120 }: { value: string; size?: number }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const v = m.size + 8;
  return (
    <Svg width={size} height={size} viewBox={`-4 -4 ${v} ${v}`} accessible={false}>
      <Rect x={-4} y={-4} width={v} height={v} fill="#fff" />
      <Path d={qrPath(m)} fill="#000" />
    </Svg>
  );
}
