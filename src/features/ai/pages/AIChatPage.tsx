import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type TouchEvent,
  type MouseEvent,
} from 'react';
import { Send, Sparkles, Loader2, Mic, Volume2, Square } from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '@/shared/lib/aiChat';
import { useVoice } from '@/shared/lib/voice';
import { AIModeTabs } from '@/features/ai/components/AIModeTabs';

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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);

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
      </header>

      <section className="card card-premium flex min-h-[65vh] flex-col p-0 md:min-h-[72vh]">
        <div className="border-b border-neutral-800 bg-gradient-to-r from-brand-gold/10 to-transparent px-4 py-3 md:px-5">
          <p className="text-sm font-medium text-white">Asistente Vinctus</p>
          <p className="text-xs text-neutral-500">
            {isListening ? 'Escuchando...' : 'Impulsado por IA'}
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
                disabled={isLoading}
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
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 rounded-full border border-neutral-700 bg-neutral-800 px-4 py-3 text-base text-white placeholder-neutral-500 transition-colors focus:border-brand-gold/50 focus:outline-none disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 rounded-full bg-brand-gold px-4 py-3 text-black transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={18} />
            </button>
          </div>

          {voiceSupported && !isListening && (
            <p className="mt-2 text-center text-[10px] text-neutral-600">
              Mantener presionado para hablar
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
