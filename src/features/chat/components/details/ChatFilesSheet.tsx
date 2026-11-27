import { FileText, Mic, Play } from 'lucide-react';
import { safeChatURL } from '@/shared/lib/chat-media';
import { formatBytes } from '@/shared/lib/formatUtils';
import { formatDayLabel } from '@/features/chat/lib/messageRuns';
import { isVisualFile, type ChatFile } from '@/features/chat/model/chatDetails';
import { ChatSheet } from './ChatSheet';

/** Photos and videos in a grid, then audio and documents in a list; each opens in a new tab. */
export default function ChatFilesSheet({
  files,
  onClose,
}: {
  files: ChatFile[];
  onClose: () => void;
}) {
  const visual = files.filter(isVisualFile);
  const documents = files.filter((file) => !isVisualFile(file));

  return (
    <ChatSheet title="Fotos y archivos" onClose={onClose}>
      {files.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          Aún no hay fotos ni archivos en este chat.
        </p>
      ) : (
        <div className="space-y-5">
          {visual.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {visual.map((file) => {
                const url = safeChatURL(file.attachment.url);
                const thumb = file.attachment.thumbUrl
                  ? safeChatURL(file.attachment.thumbUrl)
                  : null;
                const isVideo = file.attachment.contentType.startsWith('video/');
                if (!url) return null;
                return (
                  <a
                    key={`${file.messageId}_${file.attachment.path}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${file.attachment.fileName || (isVideo ? 'video' : 'imagen')}`}
                    className="relative block aspect-square overflow-hidden rounded-lg bg-neutral-900"
                  >
                    {isVideo && !thumb ? (
                      <video
                        src={url}
                        preload="metadata"
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={thumb ?? url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {isVideo && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Play size={22} className="fill-white text-white" />
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          )}

          {documents.length > 0 && (
            <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              {documents.map((file) => {
                const url = safeChatURL(file.attachment.url);
                const isAudio = file.attachment.contentType.startsWith('audio/');
                const Icon = isAudio ? Mic : FileText;
                const name = file.attachment.fileName || (isAudio ? 'Nota de voz' : 'Archivo');
                return (
                  <a
                    key={`${file.messageId}_${file.attachment.path}`}
                    href={url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-300">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{name}</span>
                      <span className="block text-xs text-neutral-500">
                        {formatBytes(file.attachment.size || 0)} · {formatDayLabel(file.createdAt)}
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-neutral-600">De los mensajes más recientes.</p>
        </div>
      )}
    </ChatSheet>
  );
}
