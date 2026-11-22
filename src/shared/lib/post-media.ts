import {
  STORAGE_CONTENT_TYPES as TYPES,
  STORAGE_MAX_BYTES as MAX,
} from './firestore/firestoreContract';

export type PostMediaKind = 'image' | 'video' | 'file';
const byExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function validatePostFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  kind: PostMediaKind,
): string {
  const raw = file.type.toLowerCase().split(';')[0].trim();
  const type =
    !raw || raw === 'application/octet-stream'
      ? byExtension[file.name.split('.').pop()?.toLowerCase() ?? '']
      : ({ 'image/jpg': 'image/jpeg', 'video/x-m4v': 'video/mp4' }[raw] ?? raw);
  const allowed = kind === 'image' ? TYPES.image : kind === 'video' ? TYPES.video : TYPES.chatFile;
  const limit = kind === 'image' ? MAX.image : kind === 'video' ? MAX.video : MAX.file;
  if (!type || !allowed.includes(type) || file.size <= 0) {
    throw new Error('El archivo está vacío o su formato no es compatible.');
  }
  if (file.size >= limit)
    throw new Error(`El archivo debe pesar menos de ${limit / 1024 / 1024} MB.`);
  return type;
}
