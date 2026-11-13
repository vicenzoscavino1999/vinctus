import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscribeToMessages,
  fetchOlderMessages,
  type MessageCursor,
  type MessageRead,
} from '@/features/chat/api';

type State = {
  id: string | null;
  messages: MessageRead[];
  cursor: MessageCursor | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
};
const empty = (id: string | null): State => ({
  id,
  messages: [],
  cursor: null,
  hasMore: false,
  loading: false,
  error: null,
});
const cursorKey = (cursor: MessageCursor | null) =>
  cursor ? `${cursor.clientCreatedAt}/${cursor.messageId}` : '';
const merge = (old: MessageRead[], incoming: MessageRead[]) =>
  [...new Map([...old, ...incoming].map((message) => [message.id, message])).values()].sort(
    (a, b) => a.clientCreatedAt - b.clientCreatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

export function useConversationMessages(conversationId: string | null, uid: string | undefined) {
  const id = uid && conversationId ? JSON.stringify([uid, conversationId]) : null;
  const [state, setState] = useState<State>(() => empty(id));
  const [retry, setRetry] = useState(0);
  const fetching = useRef<number | null>(null);
  const request = useRef({ value: 0 });
  const through = state.id === id ? state.cursor : null;
  if (state.id !== id) setState(empty(id));
  useEffect(() => {
    const lifecycle = request.current;
    lifecycle.value++;
    if (!id) return;
    let active = true;
    const fail = () => {
      if (active)
        setState((previous) => ({
          ...previous,
          error: 'No se pudieron cargar los mensajes. Reintenta.',
        }));
    };
    let stop = () => {};
    try {
      stop = subscribeToMessages(conversationId!, () => {}, {
        through,
        onPage: (page) => {
          if (!active) return;
          setState((previous) => {
            if (previous.id !== id || cursorKey(previous.cursor) !== cursorKey(through))
              return previous;
            return {
              ...previous,
              messages: merge(page.isFromCache ? previous.messages : [], page.messages),
              error: null,
              ...(!through && !page.isFromCache
                ? { cursor: page.oldestCursor, hasMore: page.hasMore }
                : {}),
            };
          });
        },
        onError: fail,
      });
    } catch {
      fail();
    }
    return () => {
      active = false;
      stop();
      lifecycle.value++;
    };
  }, [id, conversationId, through, retry]);
  const loadOlder = useCallback(async () => {
    if (!id || state.id !== id || !state.cursor || !state.hasMore || state.loading) return;
    const token = request.current.value;
    if (fetching.current === token) return;
    fetching.current = token;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const page = await fetchOlderMessages(conversationId!, state.cursor);
      if (request.current.value !== token) return;
      setState((previous) => ({
        ...previous,
        messages: merge(previous.messages, page.messages),
        cursor: page.oldestCursor ?? previous.cursor,
        hasMore: page.hasMore,
        loading: false,
      }));
    } catch {
      if (request.current.value === token)
        setState((previous) => ({
          ...previous,
          loading: false,
          error: 'No se pudo cargar el historial. Reintenta.',
        }));
    } finally {
      if (fetching.current === token) fetching.current = null;
    }
  }, [id, conversationId, state]);
  return {
    ...(state.id === id ? state : empty(id)),
    loadOlder,
    retry: () => {
      setState((previous) => ({ ...previous, loading: false }));
      setRetry((value) => value + 1);
    },
  };
}
