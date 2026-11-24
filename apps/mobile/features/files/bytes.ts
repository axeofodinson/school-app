// Native (Android): read the picked file's bytes from the cache copy.
import { File } from 'expo-file-system';

import type { PickedWorksheet } from './pick';

export async function readPicked(p: PickedWorksheet): Promise<ArrayBuffer> {
  return new File(p.uri).arrayBuffer();
}
