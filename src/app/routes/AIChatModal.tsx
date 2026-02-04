import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type TouchEvent,
  type MouseEvent,
} from 'react';
import { X, Send, Sparkles, Loader2, Mic, Volume2, Square } from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '@/shared/lib/aiChat';
import { useVoice } from '@/shared/lib/voice';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIChatModal({ isOpen, onClose }: AIChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy tu asistente de Vinctus. ¿En qué puedo ayudarte hoy?',
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

  // Voice hook
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

  // Update input with interim text while listening
  useEffect(() => {
    if (isListening && interimText) {
      setInput(interimText);
    }
  }, [isListening, interimText]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens (delayed to avoid keyboard issues)
  useEffect(() => {
    if (isOpen) {
      // Don't auto-focus on mobile to prevent keyboard issues
      const isMobile = window.innerWidth < 768;
      if (!isMobile) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isOpen]);

  // Cleanup on unmount - stop any speaking
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  // Handle hold-to-talk for microphone
  const handleMicDown = useCallback(
    (e: TouchEvent | MouseEvent) => {
      e.preventDefault(); // Prevent context menu on long press
      isHoldingRef.current = true;

      // Start listening immediately
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

  // Handle speaking a message
  const handleSpeak = useCallback(
    (messageId: string, content: string) => {
      if (speakingMessageId === messageId) {
        // Already speaking this message, stop it
        stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        // Stop any current speech and start new one
        stopSpeaking();
        setSpeakingMessageId(messageId);
        speak(content);
      }
    },
    [speakingMessageId, speak, stopSpeaking],
  );

  // Update speaking state
  useEffect(() => {
    if (!isSpeaking && speakingMessageId) {
      setSpeakingMessageId(null);
    }
  }, [isSpeaking, speakingMessageId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    // Stop listening if active
    stopListening();

    // Add user message
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

      // Add assistant response
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
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Full screen overlay */}
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Chat container - full screen on mobile */}
      <div
        className="fixed inset-0 z-[101] flex flex-col bg-neutral-900 md:inset-auto md:right-4 md:bottom-4 md:top-auto md:left-auto md:w-96 md:h-[600px] md:rounded-2xl md:border md:border-neutral-800"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-gradient-to-r from-amber-500/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Sparkles size={18} className="text-black" />
            </div>
            <div>
              <h3 className="text-white font-medium text-sm">Asistente Vinctus</h3>
              <p className="text-xs text-neutral-500">
                {isListening ? '🎤 Escuchando...' : 'Impulsado por IA'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar chat"
          >
            <X size={20} />
          </button>
        </div>

        {/* Voice error toast */}
        {voiceError && (
          <div className="px-4 py-2 bg-red-900/50 text-red-300 text-xs">{voiceError}</div>
        )}

        {/* Messages - scrollable area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="flex flex-col gap-1 max-w-[85%]">
                <div
                  className={`px-4 py-2.5 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-amber-600 text-white rounded-br-md'
                      : 'bg-neutral-800 text-neutral-100 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* TTS button for assistant messages */}
                {msg.role === 'assistant' && voiceSupported && msg.id !== 'welcome' && (
                  <button
                    onClick={() => handleSpeak(msg.id, msg.content)}
                    className={`self-start flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all ${
                      speakingMessageId === msg.id
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                    }`}
                    aria-label={speakingMessageId === msg.id ? 'Detener audio' : 'Escuchar'}
                  >
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
                  </button>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-neutral-800 text-neutral-400 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Pensando...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input - always visible at bottom */}
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-neutral-800 bg-neutral-900 flex-shrink-0"
        >
          <div className="flex gap-2 items-center">
            {/* Microphone button - hold to talk */}
            {voiceSupported && (
              <button
                type="button"
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onMouseLeave={handleMicUp}
                onTouchStart={handleMicDown}
                onTouchEnd={handleMicUp}
                disabled={isLoading}
                className={`p-3 rounded-full transition-all flex-shrink-0 select-none ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
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
              className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-full text-white text-base placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              aria-label="Enviar"
            >
              <Send size={18} />
            </button>
          </div>

          {/* Hint text */}
          {voiceSupported && !isListening && (
            <p className="text-[10px] text-neutral-600 text-center mt-2">
              Mantén presionado 🎤 para hablar
            </p>
          )}
        </form>
      </div>
    </>
  );
}
