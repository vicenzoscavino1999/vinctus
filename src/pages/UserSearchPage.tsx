import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    getOrCreateDirectConversation,
    searchUsersByDisplayName,
    type PublicUserRead
} from '../lib/firestore';

const MIN_QUERY_LENGTH = 2;

export default function UserSearchPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState<PublicUserRead[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeUid, setActiveUid] = useState<string | null>(null);

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
                if (isActive) {
                    setResults(filtered);
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

    const handleStartChat = async (target: PublicUserRead) => {
        if (!user) {
            setError('Necesitas iniciar sesion para enviar mensajes.');
            return;
        }

        setActiveUid(target.uid);
        setError(null);
        try {
            const conversationId = await getOrCreateDirectConversation(user.uid, target.uid);
            navigate(`/feed?conversation=${conversationId}`);
        } catch (err) {
            console.error('Error creating conversation:', err);
            setError('No se pudo crear la conversacion.');
        } finally {
            setActiveUid(null);
        }
    };

    const trimmedQuery = queryText.trim();
    const showHint = trimmedQuery.length < MIN_QUERY_LENGTH;

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
                            <div className="w-12 h-12 rounded-full bg-neutral-800/80 flex items-center justify-center text-lg font-medium text-neutral-300">
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
                            <div className="flex-1 min-w-0">
                                <div className="text-white font-medium truncate">
                                    {result.displayName ?? 'Usuario sin nombre'}
                                </div>
                                <div className="text-neutral-500 text-xs truncate">{result.uid}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleStartChat(result)}
                                disabled={activeUid === result.uid}
                                className="px-4 py-2 rounded-full border border-neutral-700 text-white text-sm hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {activeUid === result.uid ? 'Abriendo...' : 'Mensaje'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
