import type { ConversationRead } from '@/features/chat/api';
import { directParticipants } from '@/features/chat/lib/conversationIds';

export type InboxFilter = 'all' | 'direct' | 'group';

export const INBOX_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'direct', label: 'Privados' },
  { id: 'group', label: 'Grupos' },
];

/** Lowercase without accents, so "fisica" finds "Física". */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesQuery(name: string, query: string): boolean {
  const needle = normalizeForSearch(query);
  return !needle || normalizeForSearch(name).includes(needle);
}

/** The conversations to list for a filter and a search, without the hidden ones. */
export function filterInbox(
  conversations: readonly ConversationRead[],
  options: {
    filter: InboxFilter;
    query: string;
    nameOf: (conversation: ConversationRead) => string;
    isHidden: (conversation: ConversationRead) => boolean;
  },
): ConversationRead[] {
  return conversations.filter((conversation) => {
    if (options.isHidden(conversation)) return false;
    if (options.filter !== 'all' && conversation.type !== options.filter) return false;
    return matchesQuery(options.nameOf(conversation), options.query);
  });
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** A row's time: "14:05" today, "Ayer", the weekday this week, else "12 nov". */
export function inboxTime(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Ayer';
  if (days < 7) {
    const weekday = date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** The last message as one line: "Tú: …" for yours, "Ana: …" in a group. */
export function inboxPreview(conversation: ConversationRead, uid: string | null): string {
  const last = conversation.lastMessage;
  if (!last) {
    return conversation.type === 'group' ? 'Chat del grupo' : 'Empieza la conversación';
  }
  const text = last.text?.trim() || 'Archivo adjunto';
  if (uid && last.senderId === uid) return `Tú: ${text}`;
  const sender = last.senderName?.trim().split(/\s+/)[0];
  if (conversation.type === 'group' && sender) return `${sender}: ${text}`;
  return text;
}

/** Up to two initials for an avatar without a photo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** The other person of a direct conversation. */
export function otherMemberOf(conversation: ConversationRead, uid: string | null): string | null {
  if (!uid || conversation.type !== 'direct') return null;
  const memberIds = conversation.memberIds ?? directParticipants(conversation.id, uid);
  if (!memberIds) return null;
  return memberIds.find((id) => id !== uid) ?? null;
}

/**
 * A conversation opened by its id before it is in the list (a link, or a new direct chat with no
 * message yet), built from the id alone.
 */
export function placeholderConversation(id: string, uid: string | null): ConversationRead {
  const isGroup = id.startsWith('grp_');
  return {
    id,
    type: isGroup ? 'group' : 'direct',
    groupId: isGroup ? id.replace('grp_', '') : undefined,
    memberIds: !isGroup ? (directParticipants(id, uid ?? '') ?? undefined) : undefined,
    lastMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConversationRead;
}
