import { useEffect, useRef, useState } from 'react';
import { markConversationRead } from '@/features/chat/api';

export function useVisibleReadReceipt(
  conversationId: string | null,
  uid: string | undefined,
  timestamp: number | null,
) {
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const context = useRef({ conversationId, uid, timestamp });
  const flight = useRef<{ key: string; busy: boolean; acknowledged: number }>({
    key: '',
    busy: false,
    acknowledged: 0,
  });
  useEffect(() => {
    flight.current = { key: JSON.stringify([uid, conversationId]), busy: false, acknowledged: 0 };
    setError(null);
    return () => {
      flight.current = { key: '', busy: false, acknowledged: 0 };
    };
  }, [uid, conversationId]);
  useEffect(() => {
    context.current = { conversationId, uid, timestamp };
  }, [conversationId, uid, timestamp]);
  useEffect(() => {
    if (!uid || !conversationId) return;
    const key = JSON.stringify([uid, conversationId]);
    if (flight.current.key !== key) return;
    const state = flight.current;
    const flush = async () => {
      if (state.busy) return;
      state.busy = true;
      try {
        while (
          flight.current === state &&
          context.current.uid === uid &&
          context.current.conversationId === conversationId &&
          document.visibilityState === 'visible' &&
          document.hasFocus()
        ) {
          const target = context.current.timestamp;
          if (!target || target <= state.acknowledged) return;
          await markConversationRead(conversationId, uid, target);
          if (flight.current !== state) return;
          state.acknowledged = target;
          setError(null);
        }
      } catch {
        if (flight.current === state) setError('No se pudo confirmar la lectura.');
      } finally {
        state.busy = false;
      }
    };
    void flush();
    const visible = () => {
      void flush();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [conversationId, uid, timestamp, retry]);
  return { error, retry: () => setRetry((value) => value + 1) };
}
