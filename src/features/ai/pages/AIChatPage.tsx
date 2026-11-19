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
import { Send, Sparkles, Loader2, Mic, Volume2, Square, ImagePlus, RotateCcw } from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '@/shared/lib/aiChat';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import { useVoice } from '@/shared/lib/voice';
import { AIModeTabs } from '@/features/ai/components/AIModeTabs';
import { useAuth } from '@/context/auth';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import { LEGAL_COPY } from '@/shared/constants';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Set when the assistant created a group, to link straight to it. */
  groupId?: string;
  provider?: 'openai' | 'gemini' | 'nvidia';
  image?: string;
}

const MAX_MESSAGE_CHARS = LIMITS.aiChat.messageMaxLength;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const createWelcomeMessage = (): Message => ({
  id: 'welcome',
  role: 'assistant',
  content: 'Hola. Soy tu asistente de Vinctus. ¿En qué puedo ayudarte hoy?',
  timestamp: new Date(),
});

function AIChatSession({ userId }: { userId: string | null }) {
  const [messages, setMessages] = useState<Message[]>(() => [createWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [useOpenAI, setUseOpenAI] = useState(false);
  const [image, setImage] = useState<string | undefined>();
  const [generateImage, setGenerateImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [hasAiConsent, setHasAiConsent] = useState(() =>
    userId ? getAIConsent(userId).granted : false,
  );
  const [isConsentSyncing, setIsConsentSyncing] = useState(Boolean(userId));
  const [consentSyncError, setConsentSyncError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const isMountedRef = useRef(true);
  const conversationSeqRef = useRef(0);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(focusTimer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  const syncConsent = useCallback(async () => {
    if (!userId) {
      setHasAiConsent(false);
      setIsConsentSyncing(false);
      setConsentSyncError(null);
      return;
    }

    const localConsent = getAIConsent(userId);
    setConsentSyncError(null);
    setIsConsentSyncing(true);
    try {
      const serverConsent = await getServerAIConsent(userId);
      if (!isMountedRef.current) return;

      if (serverConsent.recorded) {
        setAIConsent(serverConsent.granted, userId);
        setHasAiConsent(serverConsent.granted);
        return;
      }

      if (localConsent.granted) {
        await updateServerAIConsent(userId, true, 'migration');
        if (!isMountedRef.current) return;
        setHasAiConsent(true);
      } else {
        setHasAiConsent(false);
      }
    } catch (error) {
      console.error('Error syncing AI consent on AI Chat:', error);
      if (!isMountedRef.current) return;
      setConsentSyncError('No se pudo verificar tu consentimiento de IA. Intenta de nuevo.');
    } finally {
      if (isMountedRef.current) {
        setIsConsentSyncing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void syncConsent();
  }, [syncConsent]);

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
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, [stopListening]);

  const handleSpeak = useCallback(
    (messageId: string, content: string) => {
      if (speakingMessageId === messageId) {
        stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        stopSpeaking();
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

  const handleResetConversation = () => {
    if (isLoading) return;
    conversationSeqRef.current += 1;
    stopSpeaking();
    stopListening();
    setSpeakingMessageId(null);
    setMessages([createWelcomeMessage()]);
    setHistory([]);
    setInput('');
    setImage(undefined);
    setGenerateImage(false);
    setImageError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasAiConsent || isConsentSyncing) return;

    const text = input.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS || isLoading) return;

    stopListening();
    const requestSeq = conversationSeqRef.current;
    const attachedImage = image;
    const shouldGenerateImage = generateImage;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(text, history, useOpenAI, {
        image: attachedImage,
        generateImage: shouldGenerateImage,
      });
      if (!isMountedRef.current || conversationSeqRef.current !== requestSeq) return;
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        groupId: response.action?.type === 'createGroup' ? response.action.groupId : undefined,
        provider: response.provider,
        image: response.image,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setHistory(response.history);
      setImage(undefined);
      setGenerateImage(false);
    } catch (error) {
      console.error('Chat error:', error);
      if (!isMountedRef.current || conversationSeqRef.current !== requestSeq) return;
      const errorText =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo.';
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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
    const reader = new FileReader();
    reader.onload = () => {
      if (isMountedRef.current && typeof reader.result === 'string') {
        setImage(reader.result);
      }
    };
    reader.onerror = () => {
      if (isMountedRef.current) {
        setImageError('No se pudo leer la imagen.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAcceptAiConsent = async () => {
    if (isConsentSyncing) return;
    setConsentSyncError(null);
    setIsConsentSyncing(true);

    try {
      if (!userId) {
        throw new Error('Debes iniciar sesión para guardar el consentimiento.');
      }
      await updateServerAIConsent(userId, true, 'ai_chat');
      if (!isMountedRef.current) return;
      setAIConsent(true, userId);
      setHasAiConsent(true);
    } catch (error) {
      console.error('Error accepting AI consent on AI Chat:', error);
      if (!isMountedRef.current) return;
      setHasAiConsent(false);
      setConsentSyncError('No se pudo guardar tu consentimiento de IA.');
    } finally {
      if (isMountedRef.current) {
        setIsConsentSyncing(false);
      }
    }
  };

  return (
    <div className="page-transition pb-24">
      <header className="mb-6 flex flex-col gap-4 pt-6 md:pt-10">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-2 text-brand-gold">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-display-sm md:text-display-md font-display text-white">
              IA Vinctus
            </h1>
            <p className="text-sm text-neutral-500">Conversación y debate en una sola vista.</p>
          </div>
        </div>

        <AIModeTabs active="chat" />
        <label className="flex items-start gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={useOpenAI}
            onChange={(e) => {
              setUseOpenAI(e.target.checked);
              if (!e.target.checked) {
                setImage(undefined);
                setGenerateImage(false);
                setImageError(null);
              }
            }}
            disabled={isLoading}
          />
          <span>
            Usar OpenAI para este chat. Al seleccionarlo, tus mensajes y el historial se envían a
            OpenAI; si no está disponible, se pueden usar Google Gemini o NVIDIA.
          </span>
        </label>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-400">
          <p>{LEGAL_COPY.aiDisclosure}</p>
          <Link
            to="/legal/privacy"
            className="mt-2 inline-block text-amber-300 hover:text-amber-200 transition-colors"
          >
            Ver política de privacidad
          </Link>
        </div>

        {consentSyncError && hasAiConsent && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <span>{consentSyncError}</span>
            <button
              type="button"
              onClick={() => void syncConsent()}
              disabled={isConsentSyncing}
              className="rounded-full border border-amber-400/50 px-3 py-1 text-xs text-amber-100 hover:border-amber-300 disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {!hasAiConsent && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <p>{LEGAL_COPY.aiConsent}</p>
            {consentSyncError && <p className="mt-2 text-red-100">{consentSyncError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAcceptAiConsent}
                disabled={isConsentSyncing}
                className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-400 transition-colors disabled:opacity-60"
              >
                {isConsentSyncing ? 'Guardando...' : 'Aceptar y continuar'}
              </button>
              {consentSyncError && (
                <button
                  type="button"
                  onClick={() => void syncConsent()}
                  disabled={isConsentSyncing}
                  className="rounded-full border border-red-400/60 px-4 py-1.5 text-xs text-red-100 hover:border-red-300 disabled:opacity-60"
                >
                  Reintentar
                </button>
              )}
              <Link
                to="/settings"
                className="rounded-full border border-red-400/60 px-4 py-1.5 text-xs text-red-100 hover:border-red-300"
              >
                Gestionar en Settings
              </Link>
            </div>
          </div>
        )}
      </header>

      <section className="card card-premium flex min-h-[65vh] flex-col p-0 md:min-h-[72vh]">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-gradient-to-r from-brand-gold/10 to-transparent px-4 py-3 md:px-5">
          <div>
            <p className="text-sm font-medium text-white">Asistente Vinctus</p>
            <p className="text-xs text-neutral-500">
              {!hasAiConsent
                ? 'Consentimiento pendiente'
                : isListening
                  ? 'Escuchando...'
                  : 'Impulsado por IA'}
            </p>
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleResetConversation}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-50"
            >
              <RotateCcw size={12} />
              <span>Nueva conversación</span>
            </button>
          )}
        </div>

        {voiceError && (
          <div className="bg-red-900/50 px-4 py-2 text-xs text-red-300">{voiceError}</div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="flex max-w-[90%] flex-col gap-1 md:max-w-[80%]">
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'rounded-br-md bg-brand-gold text-black'
                      : 'rounded-bl-md bg-neutral-800 text-neutral-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                </div>

                {msg.provider && (
                  <span className="text-xs text-neutral-500">Proveedor: {msg.provider}</span>
                )}

                {msg.image && (
                  <div className="space-y-2">
                    <img src={msg.image} alt="Imagen generada" className="max-w-full rounded-xl" />
                    <a
                      href={msg.image}
                      download="vinctus-imagen.png"
                      className="text-xs text-brand-gold"
                    >
                      Descargar imagen
                    </a>
                  </div>
                )}

                {msg.groupId && (
                  <Link
                    to={`/group/${msg.groupId}`}
                    className="self-start rounded-full border border-brand-gold/40 px-3 py-1 text-xs text-brand-gold transition-colors hover:bg-brand-gold/10"
                  >
                    Ver grupo
                  </Link>
                )}

                {msg.role === 'assistant' && voiceSupported && msg.id !== 'welcome' && (
                  <button
                    type="button"
                    onClick={() => handleSpeak(msg.id, msg.content)}
                    className={`self-start rounded-full px-2 py-1 text-xs transition-all ${
                      speakingMessageId === msg.id
                        ? 'bg-brand-gold/20 text-brand-gold'
                        : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                    }`}
                    aria-label={speakingMessageId === msg.id ? 'Detener audio' : 'Escuchar'}
                  >
                    <span className="inline-flex items-center gap-1">
                      {speakingMessageId === msg.id ? (
                        <>
                          <Square size={12} className="fill-current" />
                          <span>Detener</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={12} />
                          <span>Escuchar</span>
                        </>
                      )}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-neutral-800 px-4 py-3 text-neutral-400">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Pensando...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-neutral-800 bg-neutral-900 p-3 md:p-4"
        >
          {imageError && (
            <p role="alert" className="mb-2 text-xs text-red-300">
              {imageError}
            </p>
          )}
          {image && (
            <div className="mb-2 flex items-center gap-2 text-xs text-neutral-300">
              <img src={image} alt="Imagen adjunta" className="h-12 w-12 rounded object-cover" />
              <span>La imagen se envía solo con este mensaje.</span>
              <button
                type="button"
                onClick={() => {
                  setImage(undefined);
                  setImageError(null);
                }}
                className="text-brand-gold"
              >
                Quitar
              </button>
            </div>
          )}
          {useOpenAI && (
            <div className="mb-2 flex items-center gap-4 text-xs text-neutral-300">
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
                className="inline-flex items-center gap-1 disabled:opacity-50"
              >
                <ImagePlus size={16} /> Adjuntar imagen
              </button>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={generateImage}
                  onChange={(e) => setGenerateImage(e.target.checked)}
                  disabled={isLoading}
                />{' '}
                Crear imagen
              </label>
            </div>
          )}
          <div className="flex items-center gap-2">
            {voiceSupported && (
              <button
                type="button"
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onMouseLeave={handleMicUp}
                onTouchStart={handleMicDown}
                onTouchEnd={handleMicUp}
                disabled={isLoading || !hasAiConsent}
                className={`select-none rounded-full p-3 transition-all ${
                  isListening
                    ? 'animate-pulse bg-red-500 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                } disabled:opacity-40`}
                aria-label="Mantener para hablar"
              >
                <Mic size={18} />
              </button>
            )}

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder={isListening ? 'Hablando...' : 'Escribe un mensaje...'}
              disabled={isLoading || !hasAiConsent || isConsentSyncing}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 rounded-full border border-neutral-700 bg-neutral-800 px-4 py-3 text-base text-white placeholder-neutral-500 transition-colors focus:border-brand-gold/50 focus:outline-none disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading || !hasAiConsent || isConsentSyncing}
              className="flex-shrink-0 rounded-full bg-brand-gold px-4 py-3 text-black transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={18} />
            </button>
          </div>

          {input.length >= MAX_MESSAGE_CHARS - 200 && (
            <p className="mt-1.5 text-right text-[11px] text-neutral-500">
              {input.length}/{MAX_MESSAGE_CHARS}
            </p>
          )}

          {voiceSupported && !isListening && hasAiConsent && (
            <p className="mt-2 text-center text-[10px] text-neutral-600">
              Mantener presionado para hablar
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

export default function AIChatPage() {
  const { user } = useAuth();
  return <AIChatSession key={user?.uid ?? 'anon'} userId={user?.uid ?? null} />;
}
