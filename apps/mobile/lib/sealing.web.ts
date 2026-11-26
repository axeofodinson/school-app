// Web: each learner's unsent work (queue namespace) is sealed with their own
// AES-GCM key, made on this browser the first time and kept non-extractable in
// IndexedDB. localStorage then holds only ciphertext, so the next student on a
// shared Chromebook can't read the last one's answers by opening the storage
// panel. Honest limit: page scripts on this origin can still use the key, so
// this stops casual reading, not a determined attacker with dev tools.
import type { Cipher } from '@school/core';

const DB = 'school-sealing';
const STORE = 'keys';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  }).catch((e) => {
    dbp = null;
    throw e;
  });
  return dbp;
}

async function keyFor(userId: string): Promise<CryptoKey> {
  const d = await db();
  const found = await req<CryptoKey | undefined>(
    d.transaction(STORE, 'readonly').objectStore(STORE).get(userId),
  );
  if (found) return found;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  try {
    await req(d.transaction(STORE, 'readwrite').objectStore(STORE).add(key, userId));
    return key;
  } catch {
    // Another tab made one first: use that.
    const other = await req<CryptoKey | undefined>(
      d.transaction(STORE, 'readonly').objectStore(STORE).get(userId),
    );
    if (other) return other;
    throw new Error('no key');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function cipher(key: CryptoKey, userId: string): Cipher {
  const aad = (ctx: string) => enc.encode(`${userId}/${ctx}`);
  return {
    async seal(plain, ctx) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(ctx) },
        key,
        enc.encode(plain),
      );
      return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
    },
    async open(sealed, ctx) {
      const [iv, ct] = sealed.split('.');
      if (!iv || !ct) throw new Error('bad sealed value');
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(iv), additionalData: aad(ctx) },
        key,
        unb64(ct),
      );
      return dec.decode(pt);
    },
  };
}

const perUser = new Map<string, Promise<Cipher | null>>();

/** The learner's cipher, made once per app run; null where the browser can't (no IndexedDB / Web Crypto). */
export function sealingFor(userId: string): () => Promise<Cipher | null> {
  return () => {
    let p = perUser.get(userId);
    if (!p) {
      p =
        typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle
          ? Promise.resolve(null)
          : keyFor(userId).then(
              (k) => cipher(k, userId),
              () => null,
            );
      // A failure isn't cached forever: the next write tries again.
      p.then((c) => {
        if (!c) perUser.delete(userId);
      });
      perUser.set(userId, p);
    }
    return p;
  };
}
