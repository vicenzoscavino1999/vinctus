import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MessageRead } from '@/features/chat/api';
import ChatAttachment from './ChatAttachment';

type Props = {
  messages: MessageRead[];
  currentUserId: string | null | undefined;
  highlightMessageId: string | null;
  clearedAt: number | undefined;
  onRestoreChatLocal: () => void;
  followRequest?: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onLatestVisible: (message: MessageRead | null) => void;
};
export default function MessageThread(props: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previous = useRef({ first: '', last: '' });
  const sendRequest = useRef<string | null>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const [readPosition, setReadPosition] = useState<{ following: boolean; seen: string | null }>({
    following: true,
    seen: null,
  });
  const latest = props.messages[props.messages.length - 1];
  const captureAnchor = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top;
    const row = [...node.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (item) => item.getBoundingClientRect().bottom > top,
    );
    anchor.current = row
      ? { id: row.dataset.messageId!, offset: row.getBoundingClientRect().top - top }
      : null;
  }, []);
  const onLatestVisible = props.onLatestVisible;
  const report = useCallback(() => {
    const node = viewport.current;
    const atBottom = !!node && node.scrollHeight - node.clientHeight - node.scrollTop <= 4;
    onLatestVisible(atBottom ? (latest ?? null) : null);
  }, [latest, onLatestVisible]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (props.followRequest && props.followRequest !== sendRequest.current)
      following.current = true;
    sendRequest.current = props.followRequest ?? null;
    const first = props.messages[0]?.id ?? '';
    const last = latest?.id ?? '';
    if (
      previous.current.first &&
      first !== previous.current.first &&
      anchor.current &&
      !following.current
    ) {
      const row = [...node.querySelectorAll<HTMLElement>('[data-message-id]')].find(
        (item) => item.dataset.messageId === anchor.current?.id,
      );
      if (row)
        node.scrollTop +=
          row.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          anchor.current.offset;
    } else if (following.current) node.scrollTop = node.scrollHeight;
    previous.current = { first, last };
    captureAnchor();
    report();
  }, [props.messages, props.followRequest, latest, captureAnchor, report]);
  useEffect(() => {
    const resize = () => {
      const node = viewport.current;
      if (node && following.current) node.scrollTop = node.scrollHeight;
      report();
      captureAnchor();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (content.current) observer?.observe(content.current);
    if (viewport.current) observer?.observe(viewport.current);
    document.addEventListener('visibilitychange', resize);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', resize);
    };
  }, [captureAnchor, report]);
  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={viewport}
        role="log"
        aria-label="Mensajes de la conversación"
        className="h-full overflow-y-auto py-4 chat-scroll"
        onScroll={() => {
          const node = viewport.current!;
          const wasFollowing = following.current;
          following.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 4;
          setReadPosition((previous) => ({
            following: following.current,
            seen: wasFollowing || following.current ? (latest?.id ?? null) : previous.seen,
          }));
          captureAnchor();
          report();
        }}
      >
        <div ref={content} className="space-y-4">
          {props.hasMore && (
            <button
              type="button"
              disabled={props.loadingOlder}
              onClick={() => {
                captureAnchor();
                props.onLoadOlder();
              }}
              className="block mx-auto p-2 text-amber-400"
            >
              {props.loadingOlder ? 'Cargando historial…' : 'Cargar mensajes anteriores'}
            </button>
          )}
          {props.messages.length === 0 ? (
            <div className="text-center text-neutral-500 py-10">
              {props.clearedAt ? (
                <>
                  <p>Chat limpiado localmente.</p>
                  <button type="button" onClick={props.onRestoreChatLocal}>
                    Mostrar mensajes
                  </button>
                </>
              ) : (
                'No hay mensajes aún. ¡Envía el primero!'
              )}
            </div>
          ) : (
            props.messages.map((message) => (
              <div
                key={message.id}
                id={`msg-${message.id}`}
                data-message-id={message.id}
                className={`flex ${message.senderId === props.currentUserId ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`min-w-0 max-w-[85%] px-4 py-3 rounded-2xl space-y-2 ${message.senderId === props.currentUserId ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-100'} ${props.highlightMessageId === message.id ? 'ring-2 ring-amber-400' : ''}`}
                >
                  {(message.attachments ?? []).map((attachment, index) => (
                    <ChatAttachment key={`${attachment.path}_${index}`} attachment={attachment} />
                  ))}
                  {message.text && (
                    <div className="text-sm whitespace-pre-wrap break-words">{message.text}</div>
                  )}
                  <div className="text-xs opacity-60 text-right">
                    {new Date(message.createdAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {!readPosition.following && latest?.id !== readPosition.seen && (
        <button
          type="button"
          className="absolute bottom-3 right-3 rounded-full p-3 bg-amber-500 text-black"
          onClick={() => {
            following.current = true;
            const node = viewport.current;
            if (node) node.scrollTop = node.scrollHeight;
            setReadPosition({ following: true, seen: latest?.id ?? null });
            report();
          }}
        >
          Mensajes nuevos
        </button>
      )}
    </div>
  );
}
