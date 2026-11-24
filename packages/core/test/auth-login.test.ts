import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';

import {
  cardSheetHtml,
  classifyAuthError,
  destinationFor,
  encodeStudentQr,
  isValidPin,
  normaliseAdmissionNo,
  normalisePin,
  parseStudentQr,
  qrPath,
  qrSvg,
  staffSignIn,
  studentSignIn,
  type AuthBackend,
  type QrMatrix,
} from '../src/auth';

const HANDLE = 's.abc@students.school.invalid';

function backend(opts: {
  lookup?: { data: string | null; error: unknown };
  signIn?: { error: unknown };
  throws?: unknown;
}) {
  const calls: string[] = [];
  const b: AuthBackend = {
    async studentLoginEmail(code) {
      calls.push(`lookup:${code}`);
      if (opts.throws) throw opts.throws;
      return opts.lookup ?? { data: HANDLE, error: null };
    },
    async signInWithPassword(email, password) {
      calls.push(`signIn:${email}:${password}`);
      return opts.signIn ?? { error: null };
    },
  };
  return { b, calls };
}

describe('classifyAuthError', () => {
  it('maps the GoTrue / fetch shapes', () => {
    expect(classifyAuthError(null)).toBeNull();
    expect(classifyAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(classifyAuthError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyAuthError({ message: 'TypeError: Network request failed', code: '' })).toBe(
      'network',
    );
    expect(classifyAuthError({ status: 400, code: 'invalid_credentials' })).toBe(
      'invalidCredentials',
    );
    expect(classifyAuthError({ status: 400, code: 'user_banned', message: 'User is banned' })).toBe(
      'revoked',
    );
    expect(classifyAuthError({ status: 429, message: 'Request rate limit reached' })).toBe(
      'rateLimited',
    );
    expect(classifyAuthError({ status: 500, message: 'boom' })).toBe('unknown');
  });
});

describe('student sign-in (admission no + PIN, as the old app)', () => {
  it('looks up the synthesized email, then signs in with the PIN', async () => {
    const { b, calls } = backend({});
    expect(await studentSignIn(b, '  2025-041 ', '1234')).toBeNull();
    expect(calls).toEqual(['lookup:2025-041', `signIn:${HANDLE}:1234`]);
  });

  it('accepts Urdu digits from an Urdu keyboard', async () => {
    const { b, calls } = backend({});
    expect(await studentSignIn(b, '۲۰۲۵-۰۴۱', '۱۲۳۴')).toBeNull();
    expect(calls).toEqual(['lookup:2025-041', `signIn:${HANDLE}:1234`]);
  });

  it('validates before calling the server', async () => {
    const { b, calls } = backend({});
    expect(await studentSignIn(b, '   ', '1234')).toBe('missingCode');
    expect(await studentSignIn(b, '2025-041', '')).toBe('missingPin');
    expect(await studentSignIn(b, '2025-041', '12')).toBe('badPin');
    expect(calls).toEqual([]);
  });

  it('reports unknown admission numbers, wrong PINs and revoked logins distinctly', async () => {
    expect(
      await studentSignIn(backend({ lookup: { data: null, error: null } }).b, 'X1', '1234'),
    ).toBe('notFound');
    expect(
      await studentSignIn(
        backend({ signIn: { error: { status: 400, code: 'invalid_credentials' } } }).b,
        'X1',
        '1234',
      ),
    ).toBe('wrongPin');
    // db/009: no active enrollment -> auth user banned.
    expect(
      await studentSignIn(
        backend({ signIn: { error: { status: 400, code: 'user_banned' } } }).b,
        'X1',
        '1234',
      ),
    ).toBe('revoked');
  });

  it('never calls a network failure a wrong PIN', async () => {
    expect(
      await studentSignIn(
        backend({ lookup: { data: null, error: { message: 'Failed to fetch' } } }).b,
        'X1',
        '1234',
      ),
    ).toBe('network');
    expect(
      await studentSignIn(backend({ throws: new TypeError('Failed to fetch') }).b, 'X1', '1234'),
    ).toBe('network');
    expect(
      await studentSignIn(
        backend({ signIn: { error: { name: 'AuthRetryableFetchError', status: 0 } } }).b,
        'X1',
        '1234',
      ),
    ).toBe('network');
  });
});

describe('staff sign-in', () => {
  it('signs in with email + password', async () => {
    const { b, calls } = backend({});
    expect(await staffSignIn(b, ' t@school.pk ', 'pw')).toBeNull();
    expect(calls).toEqual(['signIn:t@school.pk:pw']);
    expect(await staffSignIn(b, '', 'pw')).toBe('missingFields');
    expect(
      await staffSignIn(
        backend({ signIn: { error: { code: 'invalid_credentials', status: 400 } } }).b,
        'a@b.c',
        'x',
      ),
    ).toBe('invalidCredentials');
  });
});

describe('admission number and PIN cleaning', () => {
  it('normalises', () => {
    expect(normaliseAdmissionNo('\u200F 2025-041\n')).toBe('2025-041');
    expect(normaliseAdmissionNo('x'.repeat(33))).toBeNull();
    expect(normalisePin('12 34-56')).toBe('123456');
    expect(normalisePin('1234567890')).toBe('12345678');
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345678')).toBe(true);
  });
});

describe('routing by role', () => {
  const signedIn = (role: string | null, student_id: string | null = null, access_tier?: string) =>
    destinationFor({ kind: 'signedIn', profile: { role, student_id, access_tier } });

  it('routes each role', () => {
    expect(destinationFor({ kind: 'initializing' })).toBe('loading');
    expect(destinationFor({ kind: 'signedOut' })).toBe('signedOut');
    expect(destinationFor({ kind: 'signedIn', profile: 'loading' })).toBe('loading');
    expect(destinationFor({ kind: 'signedIn', profile: 'error' })).toBe('profileError');
    expect(destinationFor({ kind: 'signedIn', profile: null })).toBe('pending');
    expect(signedIn('student', 'sid')).toBe('student');
    expect(signedIn('student', null)).toBe('pending');
    expect(signedIn('teacher')).toBe('teacher');
    expect(signedIn('admin')).toBe('admin');
    expect(signedIn('developer')).toBe('admin');
    expect(signedIn('pending')).toBe('pending');
    expect(signedIn('parent')).toBe('pending');
    expect(signedIn('hacker')).toBe('pending');
    expect(signedIn('student', null, 'prep')).toBe('prep');
  });
});

function matrixOf(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, isDark: (r, c) => Boolean(qr.modules.get(r, c)) };
}

/** Rasterise qrPath() back to pixels so jsQR can read what we would print. */
function rasterise(m: QrMatrix, scale = 4) {
  const quiet = 4;
  const n = (m.size + quiet * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  const d = qrPath(m);
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let col = Number(x); col < Number(x) + Number(w); col++) {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((Number(y) + quiet) * scale + dy) * n + (col + quiet) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
      }
    }
  }
  return { px, n };
}

describe('QR cards', () => {
  it('encodes the admission number only and parses it back', () => {
    expect(encodeStudentQr(' 2025-041 ')).toBe('ASHS:2025-041');
    expect(parseStudentQr('ashs:2025-041')).toBe('2025-041');
    expect(parseStudentQr('WIFI:S:lab;T:WPA;P:secret;;')).toBeNull();
    expect(parseStudentQr('ASHS:')).toBeNull();
    expect(() => encodeStudentQr('  ')).toThrow();
  });

  it('the drawn QR scans back to the payload', () => {
    const payload = encodeStudentQr('2025-041');
    const { px, n } = rasterise(matrixOf(payload));
    const read = jsQR(px, n, n);
    expect(read?.data).toBe(payload);
    expect(parseStudentQr(read!.data)).toBe('2025-041');
  });

  it('builds an escaped A4 sheet with no PIN on it', () => {
    const svg = qrSvg(matrixOf(encodeStudentQr('2025-041')));
    const cards = Array.from({ length: 11 }, (_, i) => ({
      name: i === 0 ? '<script>alert(1)</script>' : `Student ${i}`,
      admissionNo: `2025-${String(i).padStart(3, '0')}`,
      className: 'Class 9',
      qrSvg: svg,
    }));
    const html = cardSheetHtml(
      cards,
      { title: 'Cards', school: 'School', admissionNo: 'Adm. no', footer: 'Type your PIN.' },
      'rtl',
    );
    expect(html).toContain('size: A4');
    expect(html).toContain('dir="rtl"');
    expect(html.match(/class="page"/g)).toHaveLength(2); // 10 per page
    expect(html.match(/class="card"/g)).toHaveLength(11);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // The card type has no PIN field; nothing PIN-like is printed beyond the footer text.
    expect(Object.keys(cards[0]!)).not.toContain('pin');
  });
});
