import { describe, expect, it } from 'vitest';
import type { ConversationRead } from '@/features/chat/api';
import {
  filterInbox,
  inboxPreview,
  inboxTime,
  initialsOf,
  matchesQuery,
  otherMemberOf,
  placeholderConversation,
} from '@/features/chat/model/inbox';

const conversation = (overrides: Partial<ConversationRead> = {}): ConversationRead => ({
  id: 'dm_a_b',
  type: 'direct',
  memberIds: ['a', 'b'],
  lastMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const last = (text: string, senderId: string, senderName: string | null = null) => ({
  text,
  senderId,
  senderName,
  createdAt: new Date(),
  clientCreatedAt: 0,
});

describe('inboxTime', () => {
  const now = new Date(2026, 10, 26, 18, 0); // Thursday

  it('shows the time today, "Ayer", the weekday this week, then the date', () => {
    expect(inboxTime(new Date(2026, 10, 26, 9, 5), now)).toBe('09:05');
    expect(inboxTime(new Date(2026, 10, 25, 23, 0), now)).toBe('Ayer');
    expect(inboxTime(new Date(2026, 10, 23, 12, 0), now)).toBe('Lun');
    expect(inboxTime(new Date(2026, 10, 12, 12, 0), now)).toBe('12 nov');
  });

  it('is empty without a date', () => {
    expect(inboxTime(null, now)).toBe('');
  });
});

describe('inboxPreview', () => {
  it('marks your own last message', () => {
    expect(inboxPreview(conversation({ lastMessage: last('hola', 'a') }), 'a')).toBe('Tú: hola');
  });

  it('names the sender in a group by first name', () => {
    const group = conversation({
      id: 'grp_g',
      type: 'group',
      lastMessage: last('nos vemos', 'c', 'Carla Rojas'),
    });
    expect(inboxPreview(group, 'a')).toBe('Carla: nos vemos');
  });

  it('says what to do when there is no message yet', () => {
    expect(inboxPreview(conversation(), 'a')).toBe('Empieza la conversación');
    expect(inboxPreview(conversation({ id: 'grp_g', type: 'group' }), 'a')).toBe('Chat del grupo');
  });

  it('describes a message without text', () => {
    expect(inboxPreview(conversation({ lastMessage: last('  ', 'b') }), 'a')).toBe(
      'Archivo adjunto',
    );
  });
});

describe('filterInbox', () => {
  const list = [
    conversation({ id: 'dm_a_b' }),
    conversation({ id: 'grp_fisica', type: 'group', groupId: 'fisica' }),
    conversation({ id: 'dm_a_x', memberIds: ['a', 'x'] }),
  ];
  const names: Record<string, string> = {
    dm_a_b: 'Bob',
    grp_fisica: 'Física',
    dm_a_x: 'Bloqueado',
  };
  const options = {
    nameOf: (conv: ConversationRead) => names[conv.id],
    isHidden: (conv: ConversationRead) => conv.id === 'dm_a_x',
  };

  it('keeps the kind asked for and drops hidden chats', () => {
    expect(filterInbox(list, { ...options, filter: 'all', query: '' }).map((c) => c.id)).toEqual([
      'dm_a_b',
      'grp_fisica',
    ]);
    expect(filterInbox(list, { ...options, filter: 'group', query: '' }).map((c) => c.id)).toEqual([
      'grp_fisica',
    ]);
    expect(filterInbox(list, { ...options, filter: 'direct', query: '' }).map((c) => c.id)).toEqual(
      ['dm_a_b'],
    );
  });

  it('searches by name without caring about accents', () => {
    expect(
      filterInbox(list, { ...options, filter: 'all', query: 'fisi' }).map((c) => c.id),
    ).toEqual(['grp_fisica']);
    expect(matchesQuery('Mecánica Cuántica', 'cuantica')).toBe(true);
  });
});

describe('helpers', () => {
  it('makes initials', () => {
    expect(initialsOf('Carla Rojas Díaz')).toBe('CR');
    expect(initialsOf('bob')).toBe('B');
    expect(initialsOf('  ')).toBe('?');
  });

  it('finds the other person of a direct chat', () => {
    expect(otherMemberOf(conversation(), 'a')).toBe('b');
    expect(otherMemberOf(conversation({ type: 'group' }), 'a')).toBeNull();
  });

  it('builds a conversation from its id', () => {
    expect(placeholderConversation('grp_g1', 'a')).toMatchObject({ type: 'group', groupId: 'g1' });
    expect(placeholderConversation('dm_a_b', 'a')).toMatchObject({
      type: 'direct',
      memberIds: ['a', 'b'],
    });
  });
});
