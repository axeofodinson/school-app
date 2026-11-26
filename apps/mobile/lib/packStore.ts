// Offline Learn packs on Android: one file per key in the app's documents
// folder (`learn-packs/`), so a pack survives restarts and needs no size-capped
// key-value store. Keys hold only ids, versions and hex hashes; '/' becomes '~'.
// Web uses IndexedDB (packStore.web.ts). Layout: packages/core/src/packs.ts.
import type { PackStore } from '@school/core';
import { Directory, File, Paths } from 'expo-file-system';

let dir: Directory | null = null;
function folder(): Directory {
  if (!dir) dir = new Directory(Paths.document, 'learn-packs');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
const nameFor = (key: string) => key.replace(/\//g, '~');
const keyFor = (name: string) => name.replace(/~/g, '/');

export const packStore: PackStore = {
  async get(key) {
    try {
      const f = new File(folder(), nameFor(key));
      return f.exists ? await f.text() : null;
    } catch {
      return null;
    }
  },
  async put(key, value) {
    const f = new File(folder(), nameFor(key));
    if (!f.exists) f.create({ intermediates: true, overwrite: true });
    await f.write(value);
  },
  async remove(key) {
    try {
      const f = new File(folder(), nameFor(key));
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  },
  async keys(prefix) {
    try {
      return folder()
        .list()
        .filter((x): x is File => x instanceof File)
        .map((f) => keyFor(f.name))
        .filter((k) => k.startsWith(prefix));
    } catch {
      return [];
    }
  },
};
