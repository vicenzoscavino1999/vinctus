import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { MessageRead } from '@/features/chat/api';
import { describeRuns, formatDayLabel, formatMessageTime as formatTime } from '../lib/messageRuns';
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
  /** Group chats show who wrote each run of messages. */
  isGroup?: boolean;
};

const SenderAvatar = ({ name, photo }: { name: string; photo: string | null | undefined }) =>
  photo ? (
    <img src={photo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <div
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-medium text-neutral-300"
    >
      {name.charAt(0).toUpperCase() || '?'}
    </div>
  );

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
  // Only messages that arrive at the bottom after the thread opened get the entry animation;
  // the history on open and older pages loaded on top appear without it. (A CSS animation
  // plays once, when the element mounts, so re-renders don't replay it.)
  const [openingIds] = useState(() => new Set(props.messages.map((message) => message.id)));
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
        <div ref={content} className="px-1">
          {props.hasMore && (
            <button
              type="button"
              disabled={props.loadingOlder}
              onClick={() => {
                captureAnchor();
                props.onLoadOlder();
              }}
              className="mx-auto mb-4 block rounded-full px-4 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-60"
            >
              {props.loadingOlder ? 'Cargando historial…' : 'Cargar mensajes anteriores'}
            </button>
          )}
          {props.messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-neutral-500">
              {props.clearedAt ? (
                <>
                  <p>Chat limpiado localmente.</p>
                  <button
                    type="button"
                    onClick={props.onRestoreChatLocal}
                    className="text-sm font-medium text-brand-gold"
                  >
                    Mostrar mensajes
                  </button>
                </>
              ) : (
                <>
                  <p className="font-serif text-xl text-neutral-300">Empieza la conversación</p>
                  <p className="text-sm">No hay mensajes aún. ¡Envía el primero!</p>
                </>
              )}
            </div>
          ) : (
            describeRuns(props.messages).map(
              ({ message, showDay, joinsPrevious, joinsNext }, index) => {
                const mine = message.senderId === props.currentUserId;
                const showSender = !!props.isGroup && !mine && !joinsPrevious;
                const showAvatar = !!props.isGroup && !mine && !joinsNext;
                const senderName = message.senderName?.trim() || 'Miembro';
                const hasText = !!message.text;
                const isNew = !openingIds.has(message.id) && props.messages.length - index <= 3;
                // Instagram-style runs: the corners on the sender's side tighten between bubbles.
                const corners = mine
                  ? `rounded-[20px] ${joinsPrevious ? 'rounded-tr-[6px]' : ''} ${joinsNext ? 'rounded-br-[6px]' : ''}`
                  : `rounded-[20px] ${joinsPrevious ? 'rounded-tl-[6px]' : ''} ${joinsNext ? 'rounded-bl-[6px]' : ''}`;
                return (
                  <div key={message.id}>
                    {showDay && (
                      <div className="my-5 flex justify-center" role="separator">
                        <span className="rounded-full bg-neutral-900/80 px-3 py-1 text-[11px] font-medium text-neutral-400">
                          {formatDayLabel(message.createdAt)}
                        </span>
                      </div>
                    )}
                    <div
                      id={`msg-${message.id}`}
                      data-message-id={message.id}
                      className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${
                        joinsPrevious ? 'mt-0.5' : 'mt-3'
                      } ${isNew ? 'animate-message-in' : ''}`}
                    >
                      {props.isGroup && !mine && (
                        <div className="w-7 shrink-0">
                          {showAvatar && (
                            <SenderAvatar name={senderName} photo={message.senderPhotoURL} />
                          )}
                        </div>
                      )}
                      <div
                        className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}
                      >
                        {showSender && (
                          <span className="mb-1 ml-3 text-xs font-medium text-neutral-400">
                            {senderName}
                          </span>
                        )}
                        <div
                          title={formatTime(message.createdAt)}
                          className={`min-w-0 space-y-2 ${corners} ${
                            hasText ? 'px-4 py-2.5' : 'p-1.5'
                          } ${
                            mine ? 'bg-brand-gold text-black' : 'bg-neutral-800 text-neutral-100'
                          } ${props.highlightMessageId === message.id ? 'ring-2 ring-amber-300' : ''}`}
                        >
                          {(message.attachments ?? []).map((attachment, index) => (
                            <ChatAttachment
                              key={`${attachment.path}_${index}`}
                              attachment={attachment}
                            />
                          ))}
                          {hasText && (
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">
                              {message.text}
                            </div>
                          )}
                        </div>
                        {!joinsNext && (
                          <span
                            className={`mt-1 text-[11px] text-neutral-500 ${mine ? 'mr-2' : 'ml-3'}`}
                          >
                            {formatTime(message.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              },
            )
          )}
        </div>
      </div>
      {!readPosition.following && latest?.id !== readPosition.seen && (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur"
          onClick={() => {
            following.current = true;
            const node = viewport.current;
            if (node) node.scrollTop = node.scrollHeight;
            setReadPosition({ following: true, seen: latest?.id ?? null });
            report();
          }}
        >
          <ArrowDown size={15} />
          Mensajes nuevos
        </button>
      )}
    </div>
  );
}
