import { useEffect, useState } from 'react';
import { Search, UserPlus, Check, Clock, X, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import {
    getOrCreateDirectConversation,
    searchUsersByDisplayName,
    sendFriendRequest,
    getFriendshipStatus,
    acceptFriendRequest,
    cancelFriendRequest,
    type PublicUserRead
} from '../lib/firestore';

const MIN_QUERY_LENGTH = 2;

type FriendStatus = 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'loading';

interface UserWithStatus extends PublicUserRead {
    friendStatus: FriendStatus;
    requestId?: string;
}

export default function UserSearchPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState<UserWithStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        const trimmed = queryText.trim();

        if (trimmed.length < MIN_QUERY_LENGTH) {
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }

        let isActive = true;
        const handle = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const matches = await searchUsersByDisplayName(trimmed);
                const filtered = user ? matches.filter((item) => item.uid !== user.uid) : matches;

                // Get friendship status for each result
                const resultsWithStatus: UserWithStatus[] = await Promise.all(
                    filtered.map(async (item) => {
                        if (!user) return { ...item, friendStatus: 'none' as FriendStatus };
                        try {
                            const status = await getFriendshipStatus(user.uid, item.uid);
                            return { ...item, friendStatus: status.status, requestId: status.requestId };
                        } catch {
                            return { ...item, friendStatus: 'none' as FriendStatus };
                        }
                    })
                );

                if (isActive) {
                    setResults(resultsWithStatus);
                }
            } catch (searchError) {
                console.error('Error searching users:', searchError);
                if (isActive) {
                    setResults([]);
                    setError('No se pudo buscar usuarios.');
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => {
            isActive = false;
            clearTimeout(handle);
        };
    }, [queryText, user]);

    const handleSendRequest = async (target: UserWithStatus) => {
        if (!user) {
            showToast('Necesitas iniciar sesión', 'error');
            return;
        }

        setActionLoading(target.uid);
        try {
            await sendFriendRequest(
                user.uid,
                target.uid,
                user.displayName,
                user.photoURL
            );
            // Update local state
            setResults(prev => prev.map(r =>
                r.uid === target.uid
                    ? { ...r, friendStatus: 'pending_sent' as FriendStatus }
                    : r
            ));
            showToast('Solicitud enviada', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al enviar solicitud';
            showToast(message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleAcceptRequest = async (target: UserWithStatus) => {
        if (!target.requestId) return;

        setActionLoading(target.uid);
        try {
            await acceptFriendRequest(target.requestId);
            setResults(prev => prev.map(r =>
                r.uid === target.uid
                    ? { ...r, friendStatus: 'friends' as FriendStatus }
                    : r
            ));
            showToast('¡Ahora son amigos!', 'success');
        } catch (err) {
            showToast('Error al aceptar solicitud', 'error');
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelRequest = async (target: UserWithStatus) => {
        if (!target.requestId) return;

        setActionLoading(target.uid);
        try {
            await cancelFriendRequest(target.requestId);
            setResults(prev => prev.map(r =>
                r.uid === target.uid
                    ? { ...r, friendStatus: 'none' as FriendStatus, requestId: undefined }
                    : r
            ));
            showToast('Solicitud cancelada', 'info');
        } catch (err) {
            showToast('Error al cancelar solicitud', 'error');
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleStartChat = async (target: PublicUserRead) => {
        if (!user) {
            showToast('Necesitas iniciar sesión', 'error');
            return;
        }

        setActionLoading(target.uid);
        try {
            const conversationId = await getOrCreateDirectConversation(user.uid, target.uid);
            navigate(`/messages?conversation=${conversationId}`);
        } catch (err) {
            console.error('Error creating conversation:', err);
            showToast('Error al crear conversación', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const trimmedQuery = queryText.trim();
    const showHint = trimmedQuery.length < MIN_QUERY_LENGTH;

    const renderActionButton = (result: UserWithStatus) => {
        const isLoading = actionLoading === result.uid;

        switch (result.friendStatus) {
            case 'friends':
                return (
                    <div className="flex gap-2">
                        <span className="flex items-center gap-1 px-3 py-2 text-green-400 text-sm">
                            <Check size={16} />
                            Amigos
                        </span>
                        <button
                            type="button"
                            onClick={() => handleStartChat(result)}
                            disabled={isLoading}
                            className="p-2 rounded-full border border-neutral-700 text-white hover:bg-neutral-900 disabled:opacity-50"
                        >
                            <MessageCircle size={18} />
                        </button>
                    </div>
                );
            case 'pending_sent':
                return (
                    <button
                        type="button"
                        onClick={() => handleCancelRequest(result)}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/50 text-amber-400 text-sm hover:bg-amber-500/10 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                        ) : (
                            <>
                                <Clock size={16} />
                                Pendiente
                            </>
                        )}
                    </button>
                );
            case 'pending_received':
                return (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => handleAcceptRequest(result)}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-3 py-2 rounded-full bg-green-500/20 border border-green-500/50 text-green-400 text-sm hover:bg-green-500/30 disabled:opacity-50"
                        >
                            <Check size={16} />
                            Aceptar
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCancelRequest(result)}
                            disabled={isLoading}
                            className="p-2 rounded-full border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/50 disabled:opacity-50"
                        >
                            <X size={16} />
                        </button>
                    </div>
                );
            default:
                return (
                    <button
                        type="button"
                        onClick={() => handleSendRequest(result)}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black text-sm font-medium hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        ) : (
                            <>
                                <UserPlus size={16} />
                                Añadir
                            </>
                        )}
                    </button>
                );
        }
    };

    return (
        <div className="page-feed pt-10 max-w-5xl mx-auto">
            <h1 className="text-3xl font-serif font-light text-white mb-6">Buscar usuarios</h1>

            <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 mb-3">
                <input
                    type="text"
                    aria-label="Buscar usuarios"
                    placeholder="Buscar usuarios..."
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
                />
                <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
            </div>

            {showHint && (
                <div className="text-center text-neutral-500 text-sm mb-4">
                    Escribe al menos 2 letras para buscar.
                </div>
            )}

            <div className="space-y-2">
                {loading && (
                    <div className="p-6 text-center text-neutral-500">Buscando usuarios...</div>
                )}
                {!loading && error && (
                    <div className="p-6 text-center text-red-400">{error}</div>
                )}
                {!loading && !error && trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0 && (
                    <div className="p-6 text-center text-neutral-500">No hay resultados.</div>
                )}
                {!loading && !error && results.map((result) => {
                    const initial = result.displayName ? result.displayName.charAt(0).toUpperCase() : '?';
                    return (
                        <div
                            key={result.uid}
                            className="flex items-center gap-4 bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-4"
                        >
                            <div
                                className="w-12 h-12 rounded-full bg-neutral-800/80 flex items-center justify-center text-lg font-medium text-neutral-300 cursor-pointer hover:ring-2 hover:ring-amber-500/50 transition-all"
                                onClick={() => navigate(`/user/${result.uid}`)}
                            >
                                {result.photoURL ? (
                                    <img
                                        src={result.photoURL}
                                        alt={result.displayName ?? 'Usuario'}
                                        className="w-full h-full rounded-full object-cover"
                                    />
                                ) : (
                                    initial
                                )}
                            </div>
                            <div
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => navigate(`/user/${result.uid}`)}
                            >
                                <div className="text-white font-medium truncate hover:text-amber-400 transition-colors">
                                    {result.displayName ?? 'Usuario sin nombre'}
                                </div>
                                <div className="text-neutral-600 text-xs truncate">
                                    Toca para ver perfil
                                </div>
                            </div>
                            {renderActionButton(result)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
