import { useState } from 'react';
import { Search } from 'lucide-react';
import type { MessageRead } from '@/features/chat/api';
import { formatDayLabel, formatMessageTime } from '@/features/chat/lib/messageRuns';
import { searchMessages } from '@/features/chat/model/chatDetails';
import { ChatSheet } from './ChatSheet';

/** Searches the recent messages; a result opens the chat at that message. */
export default function ChatSearchSheet({
  messages,
  currentUserId,
  onJump,
  onClose,
}: {
  messages: MessageRead[];
  currentUserId: string | null | undefined;
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = searchMessages(messages, query);
  const trimmed = query.trim();

  return (
    <ChatSheet title="Buscar en la conversación" onClose={onClose}>
      <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 focus-within:border-white/20">
        <Search size={16} className="shrink-0 text-neutral-500" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar mensajes"
          aria-label="Buscar mensajes"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
        />
      </label>

      <div className="mt-3">
        {!trimmed ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Escribe para buscar en los mensajes recientes.
          </p>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Sin resultados para “{trimmed}”.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {results.map((message) => {
              const author =
                message.senderId === currentUserId ? 'Tú' : message.senderName?.trim() || 'Miembro';
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => onJump(message.id)}
                    className="block w-full py-3 text-left transition-opacity hover:opacity-80"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs font-medium text-neutral-400">
                        {author}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-600">
                        {formatDayLabel(message.createdAt)} · {formatMessageTime(message.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-white">
                      {message.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ChatSheet>
  );
}
