// File assessments (db/014): a worksheet the teacher uploads (image, markdown,
// or a document) to the private `assessment-files` bucket, which students of
// the class view. Pure rules: what may be uploaded, where it is stored, and how
// it is shown. Storage RLS (db/014) is the real boundary: it keys on the first
// path segment being the assessment id.

export const ASSESSMENT_FILES_BUCKET = 'assessment-files';

/** 10 MB: a phone photo of a worksheet fits; the free tier's 1 GB lasts. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Signed URLs live 1 hour: long enough to read, short enough that a leaked link dies. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type FileKind = 'image' | 'markdown' | 'document';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic'];
const MARKDOWN_EXT = ['md', 'markdown'];
const DOCUMENT_EXT = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'odt',
  'odp',
  'ods',
  'txt',
  'rtf',
];
export const ALLOWED_EXTENSIONS: readonly string[] = [
  ...IMAGE_EXT,
  ...MARKDOWN_EXT,
  ...DOCUMENT_EXT,
];

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  md: 'text/markdown',
  markdown: 'text/markdown',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  rtf: 'application/rtf',
};

/** Lower-case extension of a file name or path ('' when there is none). */
export function fileExtension(nameOrPath: string | null | undefined): string {
  const base =
    String(nameOrPath ?? '')
      .trim()
      .split(/[\\/]/)
      .pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

/** How to show a file: from its mime type, else its extension (pickers often report a generic mime). */
export function fileKind(
  mime: string | null | undefined,
  nameOrPath: string | null | undefined,
): FileKind {
  const m = (mime ?? '').toLowerCase();
  const ext = fileExtension(nameOrPath);
  if (m.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (m.includes('markdown') || MARKDOWN_EXT.includes(ext)) return 'markdown';
  return 'document';
}

/** i18n keys under `staff.files.errors`. */
export type UploadError = 'fileMissing' | 'fileEmpty' | 'fileTooBig' | 'fileType';

export interface PickedFile {
  name: string | null | undefined;
  size: number | null | undefined;
  mimeType: string | null | undefined;
}

export interface UploadPlan {
  ext: string;
  /** Content type sent to Storage: the picker's, unless generic or missing. */
  mime: string;
  /** Display name kept on the assessment row (trimmed, never empty). */
  name: string;
}

/** Can this picked file be uploaded? Size unknown (some pickers) is allowed; Storage enforces too. */
export function planUpload(f: PickedFile | null | undefined): UploadPlan | { error: UploadError } {
  if (!f) return { error: 'fileMissing' };
  const ext = fileExtension(f.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { error: 'fileType' };
  if (f.size != null) {
    if (f.size <= 0) return { error: 'fileEmpty' };
    if (f.size > MAX_FILE_BYTES) return { error: 'fileTooBig' };
  }
  const given = (f.mimeType ?? '').toLowerCase();
  const generic = !given || given === 'application/octet-stream' || given === '*/*';
  const name =
    String(f.name ?? '')
      .trim()
      .slice(0, 200) || `worksheet.${ext}`;
  return { ext, mime: generic ? (MIME_BY_EXT[ext] ?? 'application/octet-stream') : given, name };
}

/**
 * Object path "{assessmentId}/{uuid}.{ext}": db/014's storage policies read the
 * assessment from the first segment. A fresh uuid per upload means a replaced
 * file never overwrites the old object (history is kept; nothing is deleted).
 */
export function assessmentFilePath(assessmentId: string, uuid: string, ext: string): string {
  return `${assessmentId}/${uuid}.${ext}`;
}

/** "2.4 MB" / "830 KB" for the picked-file line (Latin digits; sizes are technical). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
