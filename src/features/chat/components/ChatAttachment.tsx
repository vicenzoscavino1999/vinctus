import { useCallback, useEffect, useRef, useState } from 'react';
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
  return (
    <div className="space-y-2 max-w-full">
      {type.startsWith('image/') ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-64 max-w-full rounded-lg object-contain"
            onError={() => setFailed(true)}
          />
        </a>
      ) : type.startsWith('video/') ? (
        <video
          ref={(node) => {
            media.current = node;
          }}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={`Video: ${name}`}
          className="max-h-64 max-w-full rounded-lg"
          onError={() => setFailed(true)}
        />
      ) : type.startsWith('audio/') ? (
        <audio
          ref={(node) => {
            media.current = node;
          }}
          src={url}
          controls
          preload="metadata"
          aria-label={`Audio: ${name}`}
          className="max-w-full"
          onError={() => setFailed(true)}
        />
      ) : null}
      {failed && (
        <p role="status" className="text-xs">
          No se pudo reproducir o mostrar el archivo. Puedes abrirlo desde el enlace.
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm underline break-all"
      >
        Abrir {name || 'archivo'}
      </a>
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
