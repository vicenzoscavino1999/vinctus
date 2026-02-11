import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type TouchEvent,
  type MouseEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles, Loader2, Mic, Volume2, Square } from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '@/shared/lib/aiChat';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import { useVoice } from '@/shared/lib/voice';
import { AIModeTabs } from '@/features/ai/components/AIModeTabs';
import { useAuth } from '@/context/auth';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import { LEGAL_COPY } from '@/shared/constants';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hola. Soy tu asistente de Vinctus. En que puedo ayudarte hoy?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [hasAiConsent, setHasAiConsent] = useState(() => getAIConsent().granted);
  const [isConsentSyncing, setIsConsentSyncing] = useState(false);
  const [consentSyncError, setConsentSyncError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const { user } = useAuth();

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
    if (isListening && interimText) {
      setInput(interimText);
    }
  }, [isListening, interimText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  useEffect(() => {
    let active = true;
    const localConsent = getAIConsent();
    setHasAiConsent(localConsent.granted);
    setConsentSyncError(null);

    const syncConsent = async () => {
      if (!user?.uid) return;

      setIsConsentSyncing(true);
      try {
        const serverConsent = await getServerAIConsent(user.uid);
        if (!active) return;

        if (serverConsent.recorded) {
          setAIConsent(serverConsent.granted);
          setHasAiConsent(serverConsent.granted);
          return;
        }

        if (localConsent.granted) {
          await updateServerAIConsent(user.uid, true, 'migration');
        }
      } catch (error) {
        console.error('Error syncing AI consent on AI Chat:', error);
        if (!active) return;
        setConsentSyncError('No se pudo verificar tu consentimiento de IA. Intenta de nuevo.');
      } finally {
        if (active) {
          setIsConsentSyncing(false);
        }
      }
    };

    void syncConsent();

    return () => {
      active = false;
    };
  }, [user?.uid]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasAiConsent) return;

    const text = input.trim();
    if (!text || isLoading) return;

    stopListening();

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
      const response = await sendChatMessage(text, history);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setHistory(response.history);
    } catch (error) {
      console.error('Chat error:', error);
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
      setIsLoading(false);
    }
  };

  const handleAcceptAiConsent = async () => {
    setConsentSyncError(null);
    setIsConsentSyncing(true);
    setAIConsent(true);
    setHasAiConsent(true);

    try {
      if (!user?.uid) {
        throw new Error('Debes iniciar sesion para guardar el consentimiento.');
      }
      await updateServerAIConsent(user.uid, true, 'ai_chat');
    } catch (error) {
      console.error('Error accepting AI consent on AI Chat:', error);
      setAIConsent(false);
      setHasAiConsent(false);
      setConsentSyncError('No se pudo guardar tu consentimiento de IA.');
    } finally {
      setIsConsentSyncing(false);
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
            <p className="text-sm text-neutral-500">Conversacion y debate en una sola vista.</p>
          </div>
        </div>

        <AIModeTabs active="chat" />
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-400">
          <p>{LEGAL_COPY.aiDisclosure}</p>
          <Link
            to="/legal/privacy"
            className="mt-2 inline-block text-amber-300 hover:text-amber-200 transition-colors"
          >
            Ver politica de privacidad
          </Link>
        </div>

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
        <div className="border-b border-neutral-800 bg-gradient-to-r from-brand-gold/10 to-transparent px-4 py-3 md:px-5">
          <p className="text-sm font-medium text-white">Asistente Vinctus</p>
          <p className="text-xs text-neutral-500">
            {!hasAiConsent
              ? 'Consentimiento pendiente'
              : isListening
                ? 'Escuchando...'
                : 'Impulsado por IA'}
          </p>
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

                {msg.role === 'assistant' && voiceSupported && msg.id !== 'welcome' && (
                  <button
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
