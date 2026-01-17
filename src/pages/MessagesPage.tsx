import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, Users, ArrowLeft, Send } from 'lucide-react';
import { useToast } from '../components/Toast';
import {
    subscribeToConversations,
    subscribeToMessages,
    sendMessage,
    markConversationRead,
    getGroup,
    getUserProfile,
    type ConversationRead,
    type MessageRead
} from '../lib/firestore';

// Helper to format relative time
const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'ahora';
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

// Group info cache type
interface GroupInfo {
    name: string;
    iconUrl?: string;
}

export default function MessagesPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [conversations, setConversations] = useState<ConversationRead[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<MessageRead[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'groups' | 'private'>('groups');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupInfoCache, setGroupInfoCache] = useState<Record<string, GroupInfo>>({});
    const [directInfoCache, setDirectInfoCache] = useState<Record<string, { name: string; photoURL: string | null }>>({});

    const [searchParams, setSearchParams] = useSearchParams();
    const conversationParam = searchParams.get('conversation');

    const parseDirectMemberIds = (conversationId: string): string[] | null => {
        if (!conversationId.startsWith('dm_')) return null;
        const parts = conversationId.slice(3).split('_');
        return parts.length >= 2 ? parts : null;
    };

    const getOtherMemberId = (conv: ConversationRead): string | null => {
        if (!user || conv.type !== 'direct') return null;
        const memberIds = conv.memberIds ?? parseDirectMemberIds(conv.id);
        if (!memberIds) return null;
        return memberIds.find((id) => id !== user.uid) ?? null;
    };

    useEffect(() => {
        if (!conversationParam) return;
        if (conversationParam !== selectedConversationId) {
            setSelectedConversationId(conversationParam);
        }

        const isGroupConversation = conversationParam.startsWith('grp_');
        const memberIds = !isGroupConversation ? parseDirectMemberIds(conversationParam) : null;
        setActiveTab(isGroupConversation ? 'groups' : 'private');

        setConversations((prev) => {
            if (prev.some((conv) => conv.id === conversationParam)) return prev;
            return [
                {
                    id: conversationParam,
                    type: isGroupConversation ? 'group' : 'direct',
                    groupId: isGroupConversation ? conversationParam.replace('grp_', '') : undefined,
                    memberIds: memberIds ?? undefined,
                    lastMessage: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                } as ConversationRead,
                ...prev
            ];
        });
    }, [conversationParam, selectedConversationId]);

    // Subscribe to conversations
    useEffect(() => {
        if (!user) {
            setConversations([]);
            setLoading(false);
            setError('Necesitas iniciar sesión para ver mensajes.');
            return;
        }

        setLoading(true);
        setError(null);

        const unsubscribe = subscribeToConversations(
            user.uid,
            (convs) => {
                setConversations(convs);
                setError(null);
                setLoading(false);

                // Fetch group info for group conversations
                convs.forEach(async (conv) => {
                    if (conv.type === 'group' && conv.groupId && !groupInfoCache[conv.groupId]) {
                        try {
                            const group = await getGroup(conv.groupId);
                            if (group) {
                                setGroupInfoCache(prev => ({
                                    ...prev,
                                    [conv.groupId!]: { name: group.name }
                                }));
                            }
                        } catch (e) {
                            console.error('Error fetching group info:', e);
                        }
                    }
                });
            },
            (err) => {
                console.error('Error loading conversations:', err);
                setLoading(false);
                setError('No se pudieron cargar conversaciones.');
            }
        );

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user || conversations.length === 0) return;

        const missingIds = new Set<string>();
        for (const conv of conversations) {
            if (conv.type !== 'direct') continue;
            const otherId = getOtherMemberId(conv);
            if (otherId && !directInfoCache[otherId]) {
                missingIds.add(otherId);
            }
        }

        if (missingIds.size === 0) return;

        missingIds.forEach((uid) => {
            void (async () => {
                try {
                    const profile = await getUserProfile(uid);
                    if (!profile) return;
                    setDirectInfoCache((prev) => {
                        if (prev[uid]) return prev;
                        return {
                            ...prev,
                            [uid]: {
                                name: profile.displayName ?? 'Usuario',
                                photoURL: profile.photoURL ?? null
                            }
                        };
                    });
                } catch (err) {
                    console.error('Error fetching user profile:', err);
                }
            })();
        });
    }, [conversations, user, directInfoCache]);

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

    const handleBackToList = () => {
        setSelectedConversationId(null);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('conversation');
        setSearchParams(nextParams, { replace: true });
    };

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversationId || !user) return;

        const text = newMessage.trim();
        setNewMessage('');
        try {
            await sendMessage(selectedConversationId, user.uid, text);
        } catch (err) {
            console.error('Error sending message:', err);
            setNewMessage(text);
            showToast('No se pudo enviar el mensaje.', 'error');
        }
    };

    // Filter conversations by type and search
    const filteredConversations = conversations.filter(conv => {
        const matchesTab = activeTab === 'groups' ? conv.type === 'group' : conv.type === 'direct';
        if (!matchesTab) return false;

        if (searchQuery.trim()) {
            const name = getConversationName(conv);
            return name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    const selectedConversation = conversations.find(c => c.id === selectedConversationId);
    const fallbackConversation = selectedConversationId && !selectedConversation
        ? {
            id: selectedConversationId,
            type: selectedConversationId.startsWith('grp_') ? 'group' : 'direct',
            groupId: selectedConversationId.startsWith('grp_') ? selectedConversationId.replace('grp_', '') : undefined,
            memberIds: selectedConversationId.startsWith('dm_') ? (parseDirectMemberIds(selectedConversationId) ?? undefined) : undefined,
            lastMessage: null,
            createdAt: new Date(),
            updatedAt: new Date()
        } as ConversationRead
        : null;
    const activeConversation = selectedConversation ?? fallbackConversation;

    // Get conversation display name
    const getConversationName = (conv: ConversationRead): string => {
        if (conv.type === 'group' && conv.groupId) {
            return groupInfoCache[conv.groupId]?.name || conv.groupId;
        }
        if (conv.type === 'direct') {
            const otherId = getOtherMemberId(conv);
            if (otherId) {
                return directInfoCache[otherId]?.name || 'Mensaje Directo';
            }
        }
        return 'Mensaje Directo';
    };

    if (loading) {
        return (
            <div className="page-feed pt-6 max-w-3xl mx-auto">
                <div className="text-center text-neutral-500 py-20">Cargando conversaciones...</div>
            </div>
        );
    }

    // Chat View (when conversation is selected)
    if (selectedConversationId && activeConversation) {
        return (
            <div className="page-feed pt-0 max-w-3xl mx-auto h-[calc(100vh-120px)] flex flex-col">
                {/* Chat Header */}
                <div className="flex items-center gap-4 py-4 border-b border-neutral-800/50">
                    <button
                        onClick={handleBackToList}
                        className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                        <Users size={18} className="text-amber-500" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-white font-medium">{getConversationName(activeConversation)}</h2>
                        {activeConversation.type === 'group' && (
                            <span className="text-xs text-neutral-500">Grupo</span>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto py-6 space-y-4">
                    {messages.length === 0 ? (
                        <div className="text-center text-neutral-500 py-10">
                            No hay mensajes aún. ¡Envía el primero!
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[75%] px-4 py-3 rounded-2xl ${msg.senderId === user?.uid
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-neutral-800/80 text-neutral-100'
                                        }`}
                                >
                                    <div className="text-sm leading-relaxed">{msg.text}</div>
                                    <div className="text-xs opacity-60 mt-1.5 text-right">
                                        {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Input */}
                <form onSubmit={handleSendMessage} className="py-4 border-t border-neutral-800/50">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="flex-1 px-5 py-3 bg-neutral-900/50 border border-neutral-800 rounded-full text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // Conversations List View
    return (
        <div className="page-feed pt-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase mb-2">En Conversación</p>
                <h1 className="text-4xl font-serif font-light text-white">Diálogos</h1>
            </div>

            {/* Search */}
            <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3.5 mb-6">
                <input
                    type="text"
                    placeholder="Buscar mensajes o grupos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light"
                />
                <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`px-8 py-2.5 rounded-full text-sm font-medium transition-all ${activeTab === 'groups'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        Grupos
                    </button>
                    <button
                        onClick={() => setActiveTab('private')}
                        className={`px-8 py-2.5 rounded-full text-sm font-medium transition-all ${activeTab === 'private'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        Privados
                    </button>
                </div>
            </div>

            {/* Error State */}
            {error && filteredConversations.length === 0 && (
                <div className="text-center text-red-400 py-10">{error}</div>
            )}

            {/* Conversations List */}
            <div className="space-y-2">
                {filteredConversations.length === 0 && !error ? (
                    <div className="text-center text-neutral-500 py-10">
                        {searchQuery ? 'No hay resultados' : `No hay ${activeTab === 'groups' ? 'grupos' : 'mensajes privados'} aún`}
                    </div>
                ) : (
                    filteredConversations.map((conv) => {
                        const groupInfo = conv.groupId ? groupInfoCache[conv.groupId] : null;
                        const name = getConversationName(conv);
                        const lastMessageTime = conv.lastMessage?.createdAt
                            ? formatRelativeTime(new Date(conv.lastMessage.createdAt))
                            : '';

                        return (
                            <button
                                key={conv.id}
                                onClick={() => handleSelectConversation(conv.id)}
                                className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all group"
                            >
                                {/* Icon */}
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {groupInfo?.iconUrl ? (
                                        <img src={groupInfo.iconUrl} alt={name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Users size={22} className="text-neutral-500" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-white font-medium truncate">{name}</span>
                                        {conv.type === 'group' && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-neutral-800/80 text-neutral-400 text-xs rounded-full">
                                                <Users size={10} />
                                                Grupo
                                            </span>
                                        )}
                                    </div>
                                    {conv.lastMessage && (
                                        <p className="text-neutral-500 text-sm truncate">
                                            {conv.lastMessage.text}
                                        </p>
                                    )}
                                </div>

                                {/* Right side */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {lastMessageTime && (
                                        <span className="text-neutral-500 text-sm">{lastMessageTime}</span>
                                    )}
                                    <ChevronRight size={18} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
