import { useEffect, useState } from 'react';
import { subscribeToMessages, type MessageRead } from '@/features/chat/api';

/**
 * The conversation's latest messages (the same page the thread opens with), for the details'
 * files and search.
 */
export function useRecentMessages(conversationId: string | null, uid: string | null) {
  const key = JSON.stringify([conversationId, uid]);
  const [state, setState] = useState<{ key: string; messages: MessageRead[] }>({
    key: '',
    messages: [],
  });

  useEffect(() => {
    if (!conversationId || !uid) return;
    try {
      return subscribeToMessages(conversationId, (messages) => setState({ key, messages }));
    } catch (error) {
      console.error('Error loading the conversation messages:', error);
    }
  }, [conversationId, uid, key]);

  return state.key === key ? state.messages : [];
}
