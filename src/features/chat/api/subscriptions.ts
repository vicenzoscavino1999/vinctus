import type { Unsubscribe } from 'firebase/firestore';
import {
  subscribeToConversations as subscribeToConversationsRaw,
  subscribeToMessages as subscribeToMessagesRaw,
  subscribeToUserMemberships as subscribeToUserMembershipsRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { validate } from '@/shared/lib/validators';
import {
  conversationIdSchema,
  safeMembershipLimit,
  uidSchema,
  type ConversationRead,
  type MessageRead,
} from '@/features/chat/api/types';

const wrapUnsubscribe = (operation: string, unsubscribe: Unsubscribe): Unsubscribe => {
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    try {
      unsubscribe();
    } catch (error) {
      console.error(`[${operation}] unsubscribe failed`, error);
    }
  };
};

export const subscribeToConversations = (
  uid: string,
  callback: (conversations: ConversationRead[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  let active = true;

  try {
    const unsubscribe = subscribeToConversationsRaw(
      safeUid,
      (conversations) => {
        if (!active) return;
        callback(conversations);
      },
      (error) => {
        if (!active) return;
        if (onError) onError(error);
      },
    );

    return wrapUnsubscribe('chat.subscribeToConversations', () => {
      active = false;
      unsubscribe();
    });
  } catch (error) {
    throw toAppError(error, { operation: 'chat.subscribeToConversations' });
  }
};

export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: MessageRead[]) => void,
): Unsubscribe => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  let active = true;

  try {
    const unsubscribe = subscribeToMessagesRaw(safeConversationId, (messages) => {
      if (!active) return;
      callback(messages);
    });

    return wrapUnsubscribe('chat.subscribeToMessages', () => {
      active = false;
      unsubscribe();
    });
  } catch (error) {
    throw toAppError(error, { operation: 'chat.subscribeToMessages' });
  }
};

export const subscribeToUserMemberships = (
  uid: string,
  onUpdate: (groupIds: string[]) => void,
  limitCount: number = 50,
): Unsubscribe => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeLimitCount = safeMembershipLimit(limitCount);
  let active = true;

  try {
    const unsubscribe = subscribeToUserMembershipsRaw(
      safeUid,
      (groupIds) => {
        if (!active) return;
        onUpdate(groupIds);
      },
      safeLimitCount,
    );

    return wrapUnsubscribe('chat.subscribeToUserMemberships', () => {
      active = false;
      unsubscribe();
    });
  } catch (error) {
    throw toAppError(error, { operation: 'chat.subscribeToUserMemberships' });
  }
};
