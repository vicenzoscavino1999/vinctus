import type { MessageRead } from '@/features/chat/api';

type Props = {
  messages: MessageRead[];
  currentUserId: string | null | undefined;
  highlightMessageId: string | null;
  clearedAt: number | undefined;
  onRestoreChatLocal: () => void;
};

const MessageThread = ({
  messages,
  currentUserId,
  highlightMessageId,
  clearedAt,
  onRestoreChatLocal,
}: Props) => {
  return (
    <div className="flex-1 overflow-y-auto py-6 space-y-4 chat-scroll">
      {messages.length === 0 ? (
        <div className="text-center text-neutral-500 py-10">
          {clearedAt ? (
            <div className="space-y-3">
              <p>Chat limpiado localmente.</p>
              <button
                type="button"
                onClick={onRestoreChatLocal}
                className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-colors text-sm"
              >
                Mostrar mensajes
              </button>
            </div>
          ) : (
            'No hay mensajes aÃºn. Â¡EnvÃ­a el primero!'
          )}
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`flex ${msg.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                msg.senderId === currentUserId
                  ? 'bg-amber-600 text-white'
                  : 'bg-neutral-800/80 text-neutral-100'
              } ${highlightMessageId === msg.id ? 'ring-2 ring-amber-400' : ''}`}
            >
              <div className="text-sm leading-relaxed">{msg.text}</div>
              <div className="text-xs opacity-60 mt-1.5 text-right">
                {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default MessageThread;
