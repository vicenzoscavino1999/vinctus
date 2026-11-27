import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { safeChatURL } from '@/shared/lib/chat-media';
import type { MessageAttachmentRead } from '@/features/chat/api';

export function ChatMediaContent({ url, type, name }: { url: string; type: string; name: string }) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // React clears callback refs before passive effect cleanup on unmount.
    const player = media.current;
    const pause = () => {
      if (document.hidden) player?.pause();
    };
    document.addEventListener('visibilitychange', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      player?.pause();
    };
  }, [url, type]);
  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  const isAudio = type.startsWith('audio/');

  // Documents are a chip that opens them; photos, videos and audio play in place, like Instagram.
  if (!isImage && !isVideo && !isAudio) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex max-w-full items-center gap-3 rounded-[14px] bg-black/10 px-3 py-2.5 transition-opacity hover:opacity-80"
      >
        <FileText size={20} className="shrink-0 opacity-80" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name || 'Archivo'}</span>
        <span className="shrink-0 text-xs opacity-70">Abrir</span>
      </a>
    );
  }

  return (
    <div className="max-w-full space-y-2">
      {isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={url}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-72 max-w-full rounded-[14px] object-cover"
            onError={() => setFailed(true)}
          />
        </a>
      ) : isVideo ? (
        <video
          ref={(node) => {
            media.current = node;
          }}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={`Video: ${name}`}
          className="max-h-72 max-w-full rounded-[14px] bg-black"
          onError={() => setFailed(true)}
        />
      ) : (
        <audio
          ref={(node) => {
            media.current = node;
          }}
          src={url}
          controls
          preload="metadata"
          aria-label={`Audio: ${name}`}
          // Dark controls instead of the browser's white pill.
          className="h-10 w-64 max-w-full [color-scheme:dark]"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <p role="status" className="text-xs">
          No se pudo reproducir o mostrar el archivo.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            Abrir {name || 'archivo'}
          </a>
        </p>
      )}
    </div>
  );
}

export default function ChatAttachment({ attachment }: { attachment: MessageAttachmentRead }) {
  const url = safeChatURL(attachment.url);
  return url ? (
    <ChatMediaContent url={url} type={attachment.contentType} name={attachment.fileName} />
  ) : (
    <p className="text-sm">Adjunto no disponible</p>
  );
}

export function PendingFilePreview({ file }: { file: File }) {
  const [url, setURL] = useState<string | null>(null);
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const local = URL.createObjectURL(file);
      setURL(local);
      return () => URL.revokeObjectURL(local);
    },
    [file],
  );
  return (
    <div ref={mount}>
      {url ? <ChatMediaContent url={url} type={file.type} name={file.name} /> : null}
    </div>
  );
}
