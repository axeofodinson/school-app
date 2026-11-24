import { describe, expect, it } from 'vitest';

import {
  assessmentFilePath,
  fileExtension,
  fileKind,
  formatBytes,
  MAX_FILE_BYTES,
  planUpload,
} from '../src/files';

describe('fileExtension', () => {
  it.each([
    ['sheet.PDF', 'pdf'],
    ['a/b/c.md', 'md'],
    ['archive.tar.gz', 'gz'],
    ['noext', ''],
    ['.hidden', ''],
    ['trailing.', ''],
    [null, ''],
  ])('%s -> %s', (n, e) => expect(fileExtension(n)).toBe(e));
});

describe('fileKind', () => {
  it('image by mime', () => expect(fileKind('image/png', 'x.bin')).toBe('image'));
  it('image by extension (generic mime)', () =>
    expect(fileKind('application/octet-stream', 'scan.JPG')).toBe('image'));
  it('markdown by mime', () => expect(fileKind('text/markdown', 'x')).toBe('markdown'));
  it('markdown by extension', () => expect(fileKind(null, 'a/b.markdown')).toBe('markdown'));
  it('pdf is a document', () => expect(fileKind('application/pdf', 'x.pdf')).toBe('document'));
  it('nothing known -> document', () => expect(fileKind(null, null)).toBe('document'));
  it('same rule table as the old FileAssessmentScreen (its "other" = document)', () => {
    // The old fileKind is module-private, so its cases are copied here.
    const cases: [string | null, string][] = [
      ['image/heic', 'x'],
      [null, 'a.webp'],
      ['text/x-markdown', 'x'],
      ['application/msword', 'a.doc'],
    ];
    expect(cases.map(([m, p]) => fileKind(m, p))).toEqual([
      'image',
      'image',
      'markdown',
      'document',
    ]);
  });
});

describe('planUpload', () => {
  it('missing file', () => expect(planUpload(null)).toEqual({ error: 'fileMissing' }));
  it('unknown type refused', () =>
    expect(
      planUpload({ name: 'virus.exe', size: 10, mimeType: 'application/x-msdownload' }),
    ).toEqual({
      error: 'fileType',
    }));
  it('no extension refused', () =>
    expect(planUpload({ name: 'README', size: 10, mimeType: 'text/plain' })).toEqual({
      error: 'fileType',
    }));
  it('empty file refused', () =>
    expect(planUpload({ name: 'a.pdf', size: 0, mimeType: 'application/pdf' })).toEqual({
      error: 'fileEmpty',
    }));
  it('too big refused', () =>
    expect(
      planUpload({ name: 'a.pdf', size: MAX_FILE_BYTES + 1, mimeType: 'application/pdf' }),
    ).toEqual({
      error: 'fileTooBig',
    }));
  it('exactly the limit is fine', () =>
    expect(
      planUpload({ name: 'a.pdf', size: MAX_FILE_BYTES, mimeType: 'application/pdf' }),
    ).toMatchObject({
      ext: 'pdf',
    }));
  it('unknown size allowed (some pickers)', () =>
    expect(planUpload({ name: 'a.png', size: null, mimeType: 'image/png' })).toEqual({
      ext: 'png',
      mime: 'image/png',
      name: 'a.png',
    }));
  it('generic mime replaced from the extension', () =>
    expect(
      planUpload({ name: 'w.md', size: 5, mimeType: 'application/octet-stream' }),
    ).toMatchObject({
      mime: 'text/markdown',
    }));
  it('missing mime replaced', () =>
    expect(planUpload({ name: 'w.docx', size: 5, mimeType: undefined })).toMatchObject({
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
  it('upper-case extension accepted, name trimmed', () =>
    expect(planUpload({ name: '  Scan.JPEG ', size: 5, mimeType: 'image/jpeg' })).toEqual({
      ext: 'jpeg',
      mime: 'image/jpeg',
      name: 'Scan.JPEG',
    }));
});

describe('assessmentFilePath', () => {
  it('assessment id is the first segment (db/014 storage RLS)', () => {
    const p = assessmentFilePath('11111111-1111-4111-8111-111111111111', 'abc', 'pdf');
    expect(p).toBe('11111111-1111-4111-8111-111111111111/abc.pdf');
    expect(p.split('/')[0]).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('formatBytes', () => {
  it.each([
    [500, '500 B'],
    [2048, '2 KB'],
    [2.5 * 1024 * 1024, '2.5 MB'],
    [null, ''],
    [-1, ''],
  ])('%s -> %s', (b, s) => expect(formatBytes(b)).toBe(s));
});
