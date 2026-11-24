// Web: read the picked File into bytes. An ArrayBuffer (not the File itself) so
// Storage gets our content type: storage-js sends a Blob as multipart with the
// browser's own guess, which is empty for .md.
import type { PickedWorksheet } from './pick';

export async function readPicked(p: PickedWorksheet): Promise<ArrayBuffer> {
  if (p.file) return p.file.arrayBuffer();
  const res = await fetch(p.uri);
  return res.arrayBuffer();
}
