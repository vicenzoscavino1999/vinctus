import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type TouchEvent,
  type MouseEvent,
  type ChangeEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
  Copy,
  Flag,
  ImagePlus,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '@/shared/lib/aiChat';
import { useVoice } from '@/shared/lib/voice';
import { useAuth } from '@/context/auth';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';
import { useToast } from '@/shared/ui/Toast';
import {
  AIConsentCard,
  AIConsentWarning,
  AIDisclosure,
  AIHeader,
} from '@/features/ai/components/AIShell';
import { useAIConsent } from '@/features/ai/hooks/useAIConsent';
import { useAIReport } from '@/features/ai/hooks/useAIReport';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Set when the assistant created a group, to link straight to it. */
  groupId?: string;
  provider?: 'openai' | 'gemini' | 'nvidia';
  image?: string;
  /** The request failed; the text explains why. */
  failed?: boolean;
}

const MAX_MESSAGE_CHARS = LIMITS.aiChat.messageMaxLength;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const PROVIDER_LABELS: Record<NonNullable<Message['provider']>, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  nvidia: 'NVIDIA',
};

/** Starting points for an empty conversation; they fill the field, they don't send. */
const SUGGESTIONS = [
  'Explícame un tema difícil en palabras simples',
  'Ideas para un proyecto de fin de semana',
  'Crea un grupo sobre astronomía',
  'Recomiéndame libros de ciencia ficción',
];

function AIChatSession({ userId }: { userId: string | null }) {
  const consent = useAIConsent(userId, 'ai_chat');
  const aiReport = useAIReport();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [useOpenAI, setUseOpenAI] = useState(false);
  const [image, setImage] = useState<string | undefined>();
  const [generateImage, setGenerateImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isHoldingRef = useRef(false);
  const isMountedRef = useRef(true);
  const conversationSeqRef = useRef(0);
  const imageReadSeqRef = useRef(0);

  const {
    isListening,
    isSpeaking,
    isSupported: voiceSupported,
    interimText,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    error: voiceError,
  } = useVoice({ lang: 'es-PE' });

  const canUse = consent.granted && !consent.busy;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isListening && interimText) {
      setInput(interimText.slice(0, MAX_MESSAGE_CHARS));
    }
  }, [isListening, interimText]);

  useEffect(() => {
    if (messages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (window.innerWidth < 768 || !canUse) return undefined;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [canUse]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  const handleMicDown = useCallback(
    (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      isHoldingRef.current = true;
      startListening();
    },
    [startListening],
  );

  const handleMicUp = useCallback(() => {
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      stopListening();
    }
  }, [stopListening]);

  const handleSpeak = useCallback(
    (messageId: string, content: string) => {
      stopSpeaking();
      if (speakingMessageId === messageId) {
        setSpeakingMessageId(null);
      } else {
        setSpeakingMessageId(messageId);
        speak(content);
      }
    },
    [speakingMessageId, speak, stopSpeaking],
  );

  useEffect(() => {
    if (!isSpeaking && speakingMessageId) {
      setSpeakingMessageId(null);
    }
  }, [isSpeaking, speakingMessageId]);

  const clearImage = () => {
    imageReadSeqRef.current += 1;
    setImage(undefined);
    setImageError(null);
  };

  const handleResetConversation = () => {
    if (isLoading) return;
    conversationSeqRef.current += 1;
    stopSpeaking();
    stopListening();
    setSpeakingMessageId(null);
    setMessages([]);
    setHistory([]);
    setInput('');
    clearImage();
    setGenerateImage(false);
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showToast('Respuesta copiada', 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canUse) return;

    const text = input.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS || isLoading) return;

    stopListening();
    const requestSeq = conversationSeqRef.current;
    const attachedImage = image;
    const shouldGenerateImage = generateImage;

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: text, timestamp: new Date() },
    ]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(text, history, useOpenAI, {
        image: attachedImage,
        generateImage: shouldGenerateImage,
      });
      if (!isMountedRef.current || conversationSeqRef.current !== requestSeq) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
          groupId: response.action?.type === 'createGroup' ? response.action.groupId : undefined,
          provider: response.provider,
          image: response.image,
        },
      ]);
      setHistory(response.history);
      clearImage();
      setGenerateImage(false);
    } catch (error) {
      console.error('Chat error:', error);
      if (!isMountedRef.current || conversationSeqRef.current !== requestSeq) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo.',
          timestamp: new Date(),
          failed: true,
        },
      ]);
    } finally {
      if (isMountedRef.current && conversationSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > MAX_IMAGE_BYTES
    ) {
      setImageError('Elige una imagen PNG, JPEG o WebP válida de hasta 2 MB.');
      return;
    }
    setImageError(null);
    imageReadSeqRef.current += 1;
    const readSeq = imageReadSeqRef.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (
        isMountedRef.current &&
        imageReadSeqRef.current === readSeq &&
        typeof reader.result === 'string'
      ) {
        setImage(reader.result);
      }
    };
    reader.onerror = () => {
      if (isMountedRef.current && imageReadSeqRef.current === readSeq) {
        setImageError('No se pudo leer la imagen.');
      }
    };
    reader.readAsDataURL(file);
  };

  const resetButton =
    messages.length > 0 ? (
      <button
        type="button"
        onClick={handleResetConversation}
        disabled={isLoading}
        aria-label="Nueva conversación"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.1] px-3 text-xs text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
      >
        <RotateCcw size={13} />
        <span className="hidden sm:inline">Nueva conversación</span>
      </button>
    ) : null;

  return (
    <div className="page-transition mx-auto flex max-w-3xl flex-col pb-28 md:pb-10">
      <AIHeader
        title="IA Vinctus"
        subtitle="Pregunta, aprende y crea."
        active="chat"
        action={resetButton}
      />

      {consent.error && consent.granted && (
        <AIConsentWarning message={consent.error} onRetry={() => void consent.retry()} />
      )}

      {!consent.granted ? (
        consent.checking ? (
          <div className="flex justify-center py-20" role="status" aria-label="Verificando">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : (
          <AIConsentCard
            saving={consent.saving}
            error={consent.error}
            onAccept={() => void consent.accept()}
            onRetry={() => void consent.retry()}
          />
        )
      ) : (
        <>
          {voiceError && (
            <p role="alert" className="mb-3 text-xs text-red-400">
              {voiceError}
            </p>
          )}

          <div className="min-h-[50vh] flex-1">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center px-2 pt-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-gold/15 text-brand-gold">
                  <Sparkles size={24} />
                </div>
                <h2 className="font-display text-2xl text-white">¿En qué te ayudo hoy?</h2>
                <p className="mt-2 max-w-sm text-sm text-neutral-500">
                  Pregúntale lo que quieras al asistente de Vinctus. También puede crear un grupo
                  por ti.
                </p>
                <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div role="log" aria-label="Conversación con la IA" className="flex flex-col gap-6">
                {messages.map((msg) =>
                  msg.role === 'user' ? (
                    <div key={msg.id} className="flex justify-end">
                      <p className="max-w-[82%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-brand-gold px-4 py-2.5 text-[15px] leading-snug text-black">
                        {msg.content}
                      </p>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
                        <Sparkles size={15} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2.5 pt-1">
                        <p
                          className={`whitespace-pre-wrap text-[15px] leading-relaxed ${
                            msg.failed ? 'text-red-300' : 'text-neutral-100'
                          }`}
                        >
                          {msg.content}
                        </p>

                        {msg.image && (
                          <div className="space-y-2">
                            <img
                              src={msg.image}
                              alt="Imagen generada"
                              className="max-w-full rounded-2xl"
                            />
                            <a
                              href={msg.image}
                              download="vinctus-imagen.png"
                              className="text-xs font-medium text-brand-gold"
                            >
                              Descargar imagen
                            </a>
                          </div>
                        )}

                        {msg.groupId && (
                          <Link
                            to={`/group/${msg.groupId}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/15 px-3 py-1.5 text-xs font-medium text-brand-gold transition-colors hover:bg-brand-gold/25"
                          >
                            <Users size={13} />
                            Ver grupo
                          </Link>
                        )}

                        {!msg.failed && (
                          <div className="-ml-1.5 flex items-center gap-0.5 text-neutral-500">
                            {voiceSupported && (
                              <button
                                type="button"
                                onClick={() => handleSpeak(msg.id, msg.content)}
                                aria-label={
                                  speakingMessageId === msg.id ? 'Detener audio' : 'Escuchar'
                                }
                                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-neutral-200 ${
                                  speakingMessageId === msg.id ? 'text-brand-gold' : ''
                                }`}
                              >
                                {speakingMessageId === msg.id ? (
                                  <Square size={13} className="fill-current" />
                                ) : (
                                  <Volume2 size={15} />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleCopy(msg.content)}
                              aria-label="Copiar respuesta"
                              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                aiReport.report({ contextId: 'chat', excerpt: msg.content })
                              }
                              aria-label="Reportar respuesta"
                              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
                            >
                              <Flag size={14} />
                            </button>
                            {msg.provider && (
                              <span className="ml-1.5 text-[11px] text-neutral-600">
                                {PROVIDER_LABELS[msg.provider]}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ),
                )}

                {isLoading && (
                  <div className="flex gap-3" role="status">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
                      <Sparkles size={15} />
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-sm text-neutral-500">
                      <span className="flex gap-1" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500 [animation-delay:300ms]" />
                      </span>
                      Pensando...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* The composer stays above the bottom bar, like the chat's. */}
          <form
            onSubmit={handleSubmit}
            className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mt-6 md:bottom-4"
          >
            <div className="rounded-[26px] border border-white/[0.08] bg-[#0b0b0b] p-2 shadow-[0_-16px_32px_rgba(10,10,10,0.9)]">
              {imageError && (
                <p role="alert" className="px-2 pb-2 text-xs text-red-400">
                  {imageError}
                </p>
              )}
              {image && (
                <div className="mb-2 flex items-center gap-3 px-2 text-xs text-neutral-400">
                  <img
                    src={image}
                    alt="Imagen adjunta"
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                  <span className="flex-1">La imagen se envía solo con este mensaje.</span>
                  <button
                    type="button"
                    onClick={clearImage}
                    aria-label="Quitar imagen"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/[0.06]"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {useOpenAI && (
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImage}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isLoading}
                      aria-label="Adjuntar imagen"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                    >
                      <ImagePlus size={19} />
                    </button>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={MAX_MESSAGE_CHARS}
                  placeholder={isListening ? 'Hablando...' : 'Escribe un mensaje...'}
                  disabled={isLoading}
                  autoComplete="off"
                  autoCorrect="off"
                  className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base text-white placeholder:text-neutral-500 focus:outline-none disabled:opacity-50"
                />
                {voiceSupported && !input.trim() && (
                  <button
                    type="button"
                    onMouseDown={handleMicDown}
                    onMouseUp={handleMicUp}
                    onMouseLeave={handleMicUp}
                    onTouchStart={handleMicDown}
                    onTouchEnd={handleMicUp}
                    disabled={isLoading}
                    aria-label="Mantener para hablar"
                    className={`flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      isListening
                        ? 'animate-pulse bg-red-500 text-white'
                        : 'text-neutral-400 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Mic size={19} />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  aria-label="Enviar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold text-black transition-transform active:scale-90 disabled:opacity-30"
                >
                  <ArrowUp size={19} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-1 pt-2 text-[11px] text-neutral-500">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={useOpenAI}
                    onChange={(e) => {
                      setUseOpenAI(e.target.checked);
                      if (!e.target.checked) {
                        clearImage();
                        setGenerateImage(false);
                      }
                    }}
                    disabled={isLoading}
                    className="accent-[#D4AF37]"
                  />
                  Usar OpenAI
                </label>
                {useOpenAI && (
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={generateImage}
                      onChange={(e) => setGenerateImage(e.target.checked)}
                      disabled={isLoading}
                      className="accent-[#D4AF37]"
                    />
                    Crear imagen
                  </label>
                )}
                {voiceSupported && !isListening && (
                  <span className="hidden sm:inline">Mantén el micrófono para hablar</span>
                )}
                {input.length >= MAX_MESSAGE_CHARS - 200 && (
                  <span className="ml-auto">
                    {input.length}/{MAX_MESSAGE_CHARS}
                  </span>
                )}
              </div>
              {useOpenAI && (
                <p className="px-3 pb-1 text-[11px] leading-snug text-amber-200/70">
                  Tus mensajes y el historial se envían a OpenAI; si no está disponible, se pueden
                  usar Google Gemini o NVIDIA.
                </p>
              )}
            </div>
          </form>

          <div className="mt-4">
            <AIDisclosure />
          </div>
        </>
      )}

      {aiReport.modal}
    </div>
  );
}

export default function AIChatPage() {
  const { user } = useAuth();
  return <AIChatSession key={user?.uid ?? 'anon'} userId={user?.uid ?? null} />;
}
