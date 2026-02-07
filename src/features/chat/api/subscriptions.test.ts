import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  subscribeToConversations,
  subscribeToMessages,
  subscribeToUserMemberships,
} from '@/features/chat/api/subscriptions';

vi.mock('@/shared/lib/firestore', () => ({
  subscribeToConversations: vi.fn(),
  subscribeToMessages: vi.fn(),
  subscribeToUserMemberships: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('chat api subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and disposes conversations subscription safely', () => {
    const rawUnsubscribe = vi.fn();
    vi.mocked(firestore.subscribeToConversations).mockImplementation((_uid, onUpdate) => {
      onUpdate([]);
      return rawUnsubscribe;
    });

    const callback = vi.fn();
    const unsubscribe = subscribeToConversations('user_1', callback);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    expect(rawUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('stops forwarding messages after unsubscribe', () => {
    let messageHandler: ((messages: unknown[]) => void) | undefined;
    vi.mocked(firestore.subscribeToMessages).mockImplementation((_conversationId, onUpdate) => {
      messageHandler = onUpdate as unknown as (messages: unknown[]) => void;
      return vi.fn();
    });

    const callback = vi.fn();
    const unsubscribe = subscribeToMessages('dm_user_1_user_2', callback);

    if (messageHandler) {
      messageHandler([{ id: 'm1' }]);
    }
    unsubscribe();
    if (messageHandler) {
      messageHandler([{ id: 'm2' }]);
    }

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('sanitizes membership limit before subscribing', () => {
    const rawUnsubscribe = vi.fn();
    vi.mocked(firestore.subscribeToUserMemberships).mockReturnValue(rawUnsubscribe);

    const unsubscribe = subscribeToUserMemberships('user_1', vi.fn(), 999);
    expect(firestore.subscribeToUserMemberships).toHaveBeenCalledWith(
      'user_1',
      expect.any(Function),
      50,
    );
    unsubscribe();
    expect(rawUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
