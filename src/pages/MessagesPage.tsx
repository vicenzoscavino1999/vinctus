import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import {
    subscribeToConversations,
    subscribeToMessages,
    sendMessage,
    markConversationRead,
    type ConversationRead,
    type MessageRead
} from '../lib/firestore';

export default function MessagesPage() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<ConversationRead[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<MessageRead[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchParams, setSearchParams] = useSearchParams();
    const conversationParam = searchParams.get('conversation');

    useEffect(() => {
        if (conversationParam && conversationParam !== selectedConversationId) {
            setSelectedConversationId(conversationParam);
        }
    }, [conversationParam, selectedConversationId]);

    // Subscribe to conversations
    useEffect(() => {
        if (!user) {
            setConversations([]);
            setLoading(false);
            setError('Necesitas iniciar sesion para ver mensajes.');
            return;
        }

        setLoading(true);
        setError(null);

        const unsubscribe = subscribeToConversations(
            user.uid,
            (convs) => {
                setConversations(convs);
                setLoading(false);
            },
            (err) => {
                console.error('Error loading conversations:', err);
                setConversations([]);
                setLoading(false);
                setError('No se pudieron cargar conversaciones.');
            }
        );

        return () => unsubscribe();
    }, [user]);

    // Subscribe to messages of selected conversation
    useEffect(() => {
        if (!selectedConversationId) return;

        const unsubscribe = subscribeToMessages(selectedConversationId, (msgs) => {
            setMessages(msgs.reverse()); // Reverse to show oldest first
        });

        return () => unsubscribe();
    }, [selectedConversationId]);

    // Mark as read when opening conversation
    useEffect(() => {
        if (!selectedConversationId || !user) return;

        markConversationRead(selectedConversationId, user.uid);
    }, [selectedConversationId, user]);

    const handleSelectConversation = (conversationId: string) => {
        setSelectedConversationId(conversationId);

        if (conversationId !== conversationParam) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('conversation', conversationId);
            setSearchParams(nextParams, { replace: true });
        }
    };

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversationId || !user) return;

        const text = newMessage.trim();
        setNewMessage('');

        await sendMessage(selectedConversationId, user.uid, text);
    };

    if (loading) {
        return (
            <div className="page-feed pt-10 max-w-6xl mx-auto">
                <div className="text-center text-neutral-500">Cargando conversaciones...</div>
            </div>
        );
    }

    return (
        <div className="page-feed pt-10 max-w-6xl mx-auto">
            <h1 className="text-3xl font-serif font-light text-white mb-8">Dialogos</h1>

            <div className="flex gap-6 h-[calc(100vh-200px)]">
                {/* Conversations List */}
                <div className="w-80 border border-neutral-800 rounded-lg overflow-hidden flex flex-col bg-neutral-900/20">
                    <div className="p-4 border-b border-neutral-800">
                        <h2 className="text-lg font-medium text-white">Conversaciones</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {error ? (
                            <div className="p-6 text-center text-red-400">
                                {error}
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="p-6 text-center text-neutral-500">
                                No hay conversaciones aun
                            </div>
                        ) : (
                            conversations.map((conv) => (
                                <button
                                    key={conv.id}
                                    onClick={() => handleSelectConversation(conv.id)}
                                    className={`w-full p-4 text-left border-b border-neutral-800 hover:bg-neutral-800/30 transition ${selectedConversationId === conv.id ? 'bg-neutral-800/50' : ''
                                        }`}
                                >
                                    <div className="font-medium text-white truncate">
                                        {conv.type === 'group' ? `Grupo: ${conv.groupId}` : 'Mensaje Directo'}
                                    </div>
                                    {conv.lastMessage && (
                                        <div className="text-sm text-neutral-500 truncate mt-1">
                                            {conv.lastMessage.text}
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat View */}
                <div className="flex-1 border border-neutral-800 rounded-lg overflow-hidden flex flex-col bg-neutral-900/20">
                    {!selectedConversationId ? (
                        <div className="flex items-center justify-center h-full text-neutral-500">
                            Selecciona una conversacion para empezar a chatear
                        </div>
                    ) : (
                        <>
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-md px-4 py-3 rounded-2xl ${msg.senderId === user?.uid
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-neutral-800 text-neutral-100'
                                                }`}
                                        >
                                            <div className="text-sm leading-relaxed">{msg.text}</div>
                                            <div className="text-xs opacity-60 mt-2">
                                                {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input */}
                            <form onSubmit={handleSendMessage} className="p-4 border-t border-neutral-800">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder="Escribe un mensaje..."
                                        className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-full text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newMessage.trim()}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
                                    >
                                        Enviar
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
