// RFC 4122 version-5 UUIDs (SHA-1, name-based). Every seeded row gets its id
// from a stable name ("student:0042"), so a re-run produces the same ids and the
// upserts (`on conflict do nothing`) turn into no-ops instead of duplicates.
import { createHash } from 'node:crypto';

/** RFC 4122 URL namespace, used to derive the seed's own namespace. */
export const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function toBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a uuid: ${uuid}`);
  return Buffer.from(hex, 'hex');
}

function format(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function uuidv5(name: string, namespace: string): string {
  const hash = createHash('sha1').update(toBytes(namespace)).update(name, 'utf8').digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return format(bytes);
}

/** id('student', 42) → the same uuid on every run for the same seed string. */
export type IdFn = (kind: string, ...key: (string | number)[]) => string;

export function makeIdFn(seedString: string): IdFn {
  const ns = uuidv5(seedString, URL_NAMESPACE);
  return (kind, ...key) => uuidv5(`${kind}:${key.join(':')}`, ns);
}
