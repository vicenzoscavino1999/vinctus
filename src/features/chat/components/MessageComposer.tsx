import { ArrowUp, Plus, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
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
/** The textarea grows with the text up to this height, then scrolls. */
const MAX_INPUT_HEIGHT = 144;

export default function MessageComposer(props: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = (files: File[]) => {
    props.onFiles(files);
    setError(null);
  };
  const hasContent = !!props.value.trim() || props.files.length > 0;
  const canSend =
    !props.sending && !busy && hasContent && props.value.length <= LIMITS.messages.textMaxLength;
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [props.value]);
  return (
    <form
      onSubmit={(event) => {
        if (!canSend) {
          event.preventDefault();
          return;
        }
        props.onSubmit(event);
      }}
      className="shrink-0 space-y-2 border-t border-neutral-900 pb-1 pt-2"
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
        <div
          key={message.id}
          className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate text-neutral-300">
            No enviado: {message.text || `Adjuntos (${message.files.length})`}
          </span>
          <button
            type="button"
            disabled={props.sending || busy}
            onClick={() => props.onRetry(message)}
            className="font-medium text-brand-gold"
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
        <div aria-label="Archivos pendientes" className="flex max-h-48 gap-3 overflow-x-auto">
          {props.files.map((entry) => (
            <div
              key={entry.id}
              className="min-w-44 max-w-64 rounded-2xl border border-neutral-800 bg-neutral-900 p-2"
            >
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
      {/* One row, like Instagram: attach, the growing input, and the mic that turns into send. */}
      <div className="flex items-end gap-2">
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
        {!busy && (
          <>
            <button
              type="button"
              aria-label="Adjuntar fotos, videos o archivos"
              disabled={props.sending || props.files.length >= 10}
              onClick={() => picker.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-gold/60 text-brand-gold transition-colors hover:bg-brand-gold/10 disabled:opacity-40"
            >
              <Plus size={20} />
            </button>
            <div className="min-w-0 flex-1 rounded-[22px] border border-neutral-800 bg-neutral-900 transition-colors focus-within:border-neutral-600">
              <textarea
                ref={input}
                value={props.value}
                onChange={(event) => props.onValueChange(event.target.value)}
                placeholder="Escribe un mensaje..."
                aria-label="Mensaje"
                rows={1}
                maxLength={LIMITS.messages.textMaxLength}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                className="block w-full resize-none bg-transparent px-4 py-2.5 text-[15px] leading-snug text-white placeholder:text-neutral-500 focus:outline-none"
                style={{ maxHeight: MAX_INPUT_HEIGHT }}
              />
            </div>
          </>
        )}
        {hasContent && !busy && (
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={!canSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold text-black transition-transform active:scale-90 disabled:opacity-40"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        )}
        {/* Always mounted, so a recording that just finished can report it is done; hidden while
            there is something to send. */}
        <div className={busy ? 'min-w-0 flex-1' : hasContent ? 'hidden' : 'shrink-0'}>
          <VoiceRecorder
            disabled={props.sending || props.files.length >= 10}
            onFile={(file) => add([file])}
            onBusy={setBusy}
          />
        </div>
      </div>
    </form>
  );
}
