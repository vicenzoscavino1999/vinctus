import type { MessageAttachmentRead, MessageRead, UserReportReason } from '@/features/chat/api';

export const REPORT_REASONS: Array<{ value: UserReportReason; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'abuse', label: 'Abuso' },
  { value: 'fake', label: 'Suplantación' },
  { value: 'other', label: 'Otro' },
];

/** Hours offered by "Silenciar"; null is "Hasta que lo actives". */
export const MUTE_OPTIONS: Array<{ hours: number | null; label: string }> = [
  { hours: 1, label: '1 hora' },
  { hours: 4, label: '4 horas' },
  { hours: 8, label: '8 horas' },
  { hours: null, label: 'Hasta que lo actives' },
];

/** "Silenciado", "Silenciado hasta las 14:30" or "Silenciado hasta el vie 09:00"; null if not muted. */
export const muteStatusText = (
  muted: boolean,
  mutedUntil: Date | null,
  now: Date = new Date(),
): string | null => {
  if (!muted) return null;
  if (!mutedUntil) return 'Silenciado';
  if (mutedUntil <= now) return null;
  const time = mutedUntil.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (mutedUntil.toDateString() === now.toDateString()) return `Silenciado hasta las ${time}`;
  const day = mutedUntil.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  return `Silenciado hasta el ${day} ${time}`;
};

export type ChatFile = {
  messageId: string;
  senderId: string;
  createdAt: Date;
  attachment: MessageAttachmentRead;
};

export const isVisualFile = (file: ChatFile) =>
  file.attachment.contentType.startsWith('image/') ||
  file.attachment.contentType.startsWith('video/');

/** The attachments of the loaded messages, newest first. */
export const chatFilesOf = (messages: MessageRead[]): ChatFile[] =>
  [...messages]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .flatMap((message) =>
      (message.attachments ?? []).map((attachment) => ({
        messageId: message.id,
        senderId: message.senderId,
        createdAt: message.createdAt,
        attachment,
      })),
    );

/** Messages whose text contains the query (case and accents ignored), newest first. */
export const searchMessages = (messages: MessageRead[], query: string): MessageRead[] => {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const needle = fold(query.trim());
  if (!needle) return [];
  return [...messages]
    .filter((message) => fold(message.text ?? '').includes(needle))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};
