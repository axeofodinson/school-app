// Text -> QR module matrix with the bundled `qrcode` encoder (no CDN, no canvas).
import type { QrMatrix } from '@school/core';
import QRCode from 'qrcode';

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, isDark: (r, c) => Boolean(qr.modules.get(r, c)) };
}
