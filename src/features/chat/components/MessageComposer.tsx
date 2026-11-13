import { Send, Paperclip, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { LIMITS, STORAGE_CONTENT_TYPES } from '@/shared/lib/firestore/firestoreContract';
import type { OutboxMessage, PendingFile } from '../lib/ConversationOutbox';
import { PendingFilePreview } from './ChatAttachment';
import VoiceRecorder from './VoiceRecorder';

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  files: PendingFile[];
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  sending: boolean;
  progress: number;
  failed: OutboxMessage[];
  error: string | null;
  onRetry: (message: OutboxMessage) => void;
  onDiscard: (id: string) => void;
};
const accept = [
  ...STORAGE_CONTENT_TYPES.image,
  ...STORAGE_CONTENT_TYPES.video,
  ...STORAGE_CONTENT_TYPES.chatAudio,
  ...STORAGE_CONTENT_TYPES.chatFile,
].join(',');
export default function MessageComposer(props: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = (files: File[]) => {
    props.onFiles(files);
    setError(null);
  };
  const canSend =
    !props.sending &&
    !busy &&
    (!!props.value.trim() || props.files.length > 0) &&
    props.value.length <= LIMITS.messages.textMaxLength;
  return (
    <form
      onSubmit={(event) => {
        if (!canSend) {
          event.preventDefault();
          return;
        }
        props.onSubmit(event);
      }}
      className="py-3 border-t border-neutral-800/50 space-y-2 shrink-0"
    >
      {(error || props.error) && (
        <p role="alert" className="text-sm text-red-400">
          {error || props.error}
        </p>
      )}
      {props.sending && (
        <progress
          aria-label="Progreso de envío"
          value={props.progress}
          max={1}
          className="w-full"
        />
      )}
      {props.failed.map((message) => (
        <div key={message.id} className="flex gap-2 items-center text-sm">
          <span className="min-w-0 flex-1 truncate">
            No enviado: {message.text || `Adjuntos (${message.files.length})`}
          </span>
          <button
            type="button"
            disabled={props.sending || busy}
            onClick={() => props.onRetry(message)}
            className="text-amber-400"
          >
            Reintentar envío
          </button>
          <button
            type="button"
            disabled={props.sending}
            aria-label="Descartar mensaje no enviado"
            onClick={() => props.onDiscard(message.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {props.files.length > 0 && (
        <div aria-label="Archivos pendientes" className="flex gap-3 overflow-x-auto max-h-48">
          {props.files.map((entry) => (
            <div key={entry.id} className="min-w-44 max-w-64 p-2 bg-neutral-900 rounded-lg">
              <button
                type="button"
                disabled={busy}
                onClick={() => props.onRemove(entry.id)}
                aria-label={`Quitar ${entry.file.name}`}
                className="float-right p-1"
              >
                <X size={16} />
              </button>
              <PendingFilePreview file={entry.file} />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input
          ref={picker}
          type="file"
          multiple
          accept={accept}
          aria-label="Seleccionar adjuntos"
          className="hidden"
          onChange={(event) => {
            try {
              add(Array.from(event.target.files ?? []));
            } catch (problem) {
              setError(
                problem instanceof Error ? problem.message : 'No se pudo adjuntar el archivo.',
              );
            }
            event.target.value = '';
          }}
        />
        <button
          type="button"
          aria-label="Adjuntar fotos, videos o archivos"
          disabled={props.sending || busy || props.files.length >= 10}
          onClick={() => picker.current?.click()}
          className="p-3 bg-neutral-800 rounded-full disabled:opacity-40"
        >
          <Paperclip size={20} />
        </button>
        <textarea
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          placeholder="Escribe un mensaje..."
          aria-label="Mensaje"
          rows={1}
          disabled={busy}
          maxLength={LIMITS.messages.textMaxLength}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-w-0 flex-1 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-2xl text-white resize-none"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          disabled={!canSend}
          className="p-3 bg-amber-500 text-black rounded-full disabled:opacity-40"
        >
          <Send size={20} />
        </button>
      </div>
      <VoiceRecorder
        disabled={props.sending || props.files.length >= 10}
        onFile={(file) => add([file])}
        onBusy={setBusy}
      />
    </form>
  );
}
