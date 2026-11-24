import * as Print from 'expo-print';
import { Platform } from 'react-native';

/**
 * Print a full HTML document. Web: a hidden same-origin iframe (the browser's
 * print dialog, "Save as PDF" included). Android: the system print sheet.
 */
export async function printHtml(html: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html });
    return;
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error('print frame unavailable');
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 50)); // let layout settle
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 1000);
}
