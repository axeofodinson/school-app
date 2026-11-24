// Chunked values for small secure stores. expo-secure-store warns (and older
// Android keystores fail) above ~2 KB per value, and a Supabase session JSON is
// often bigger. This splits a value across `<key>.0 … <key>.n` with a count in
// `<key>.n`. Keys stay within SecureStore's allowed characters [A-Za-z0-9._-].

export interface SimpleStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

function countKey(key: string) {
  return `${key}.n`;
}

function checkKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error(`unsafe secure-store key: ${key}`);
}

export function chunkedStore(inner: SimpleStore, chunkSize = CHUNK_SIZE): SimpleStore {
  if (chunkSize < 1) throw new Error('chunk size must be positive');

  async function count(key: string): Promise<number> {
    const raw = await inner.getItem(countKey(key));
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async function clear(key: string) {
    const n = await count(key);
    for (let i = 0; i < n; i++) await inner.removeItem(`${key}.${i}`);
    await inner.removeItem(countKey(key));
  }

  return {
    async getItem(key) {
      checkKey(key);
      const n = await count(key);
      if (n === 0) return null;
      let out = '';
      for (let i = 0; i < n; i++) {
        const part = await inner.getItem(`${key}.${i}`);
        if (part === null) return null; // torn write: treat as no value
        out += part;
      }
      return out;
    },
    async setItem(key, value) {
      checkKey(key);
      await clear(key);
      const parts: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) parts.push(value.slice(i, i + chunkSize));
      if (parts.length === 0) parts.push('');
      for (let i = 0; i < parts.length; i++) await inner.setItem(`${key}.${i}`, parts[i]!);
      // Count last, so a crash mid-write reads as "no value", never half a value.
      await inner.setItem(countKey(key), String(parts.length));
    },
    async removeItem(key) {
      checkKey(key);
      await clear(key);
    },
  };
}
