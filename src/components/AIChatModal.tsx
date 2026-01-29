import { useState, useRef, useEffect, type FormEvent } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { sendChatMessage, type GeminiMessage } from '../lib/aiChat';

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
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<GeminiMessage[]>([]);
    const [viewportHeight, setViewportHeight] = useState('100dvh');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Handle viewport changes (keyboard appearing/disappearing)
    useEffect(() => {
        if (!isOpen) return;

        const handleResize = () => {
            // Use visualViewport for accurate height when keyboard is open
            if (window.visualViewport) {
                const vh = window.visualViewport.height;
                setViewportHeight(`${vh}px`);
            }
        };

        // Listen to visual viewport changes
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            window.visualViewport.addEventListener('scroll', handleResize);
            handleResize(); // Initial call
        }

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
                window.visualViewport.removeEventListener('scroll', handleResize);
            }
        };
    }, [isOpen]);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || isLoading) return;

        // Add user message
        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await sendChatMessage(text, history);

            // Add assistant response
            const assistantMessage: Message = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: response.response,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMessage]);
            setHistory(response.history);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:justify-end p-0 md:p-4"
            style={{ height: viewportHeight }}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                ref={modalRef}
                className="relative w-full md:w-96 md:h-[600px] md:mr-4 bg-neutral-900 border border-neutral-800 md:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden"
                style={{
                    height: 'calc(100% - env(safe-area-inset-top, 0px))',
                    maxHeight: '100%',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)'
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
                            <p className="text-xs text-neutral-500">Impulsado por IA</p>
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

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll min-h-0">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] px-4 py-2.5 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-amber-600 text-white rounded-br-md'
                                    : 'bg-neutral-800 text-neutral-100 rounded-bl-md'
                                    }`}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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

                {/* Input - Fixed at bottom */}
                <form onSubmit={handleSubmit} className="p-3 border-t border-neutral-800 bg-neutral-900 flex-shrink-0">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-full text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                            aria-label="Enviar"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

