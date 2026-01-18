import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { addPostComment, getPostCommentCount, getPostComments, type PaginatedResult, type PostCommentRead } from '../lib/firestore';
import { useToast } from './Toast';

type PostSummary = {
    postId: string;
    authorName: string;
    authorPhoto: string | null;
    text: string;
    imageUrl: string | null;
};

interface PostCommentsModalProps {
    isOpen: boolean;
    post: PostSummary | null;
    onClose: () => void;
    onCommentAdded: (postId: string) => void;
}

const formatRelativeTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'Ahora';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} d`;
};

const PostCommentsModal = ({ isOpen, post, onClose, onCommentAdded }: PostCommentsModalProps) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [comments, setComments] = useState<PostCommentRead[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [commentsCursor, setCommentsCursor] = useState<PaginatedResult<PostCommentRead>['lastDoc']>(null);
    const [hasMore, setHasMore] = useState(false);
    const [commentTotal, setCommentTotal] = useState<number | null>(null);

    const COMMENTS_PAGE_SIZE = 12;

    const loadComments = useCallback(async (
        loadMore = false,
        cursor?: PaginatedResult<PostCommentRead>['lastDoc']
    ) => {
        if (!post) return;
        try {
            setError(null);
            if (loadMore) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            const [data, total] = await Promise.all([
                getPostComments(
                    post.postId,
                    COMMENTS_PAGE_SIZE,
                    loadMore ? (cursor ?? undefined) : undefined
                ),
                loadMore ? Promise.resolve(null) : getPostCommentCount(post.postId)
            ]);
            setComments((prev) => (loadMore ? [...prev, ...data.items] : data.items));
            setCommentsCursor(data.lastDoc);
            setHasMore(data.hasMore);
            if (!loadMore && total !== null) {
                setCommentTotal(total);
            }
        } catch (loadError) {
            console.error('Error loading comments:', loadError);
            setError('No se pudieron cargar los comentarios.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [post]);

    useEffect(() => {
        if (!isOpen || !post) return;
        setComments([]);
        setCommentsCursor(null);
        setHasMore(false);
        setCommentTotal(null);
        loadComments();
        setMessage('');
    }, [isOpen, post, loadComments]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!post) return;
        if (!user) {
            setError('Inicia sesion para comentar.');
            return;
        }

        const trimmed = message.trim();
        if (!trimmed) {
            setError('Escribe un comentario.');
            return;
        }

        setSubmitting(true);
        try {
            await addPostComment(
                post.postId,
                user.uid,
                {
                    displayName: user.displayName || 'Usuario',
                    photoURL: user.photoURL || null
                },
                trimmed
            );
            setMessage('');
            showToast('Comentario enviado', 'success');
            onCommentAdded(post.postId);
            await loadComments(false);
        } catch (submitError) {
            console.error('Error adding comment:', submitError);
            setError('No se pudo enviar el comentario.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen || !post) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-4xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <MessageCircle size={18} className="text-amber-400" />
                        <h2 className="text-lg font-serif text-white">Comentarios</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                            {post.imageUrl ? (
                                <div className="h-56 md:h-72 overflow-hidden">
                                    <img src={post.imageUrl} alt="Post" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div className="h-56 md:h-72 bg-neutral-800 flex items-center justify-center text-neutral-500 text-sm">
                                    Sin imagen
                                </div>
                            )}
                            <div className="p-6 space-y-3">
                                <div className="flex items-center gap-3 text-sm text-neutral-400">
                                    {post.authorPhoto ? (
                                        <img
                                            src={post.authorPhoto}
                                            alt={post.authorName}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">
                                            {post.authorName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <span>Por {post.authorName}</span>
                                </div>
                                <p className="text-white text-xl md:text-2xl font-serif leading-snug line-clamp-4">
                                    {post.text}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-serif text-white">Comentarios ({commentTotal ?? comments.length})</h3>
                        </div>

                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-sm text-neutral-500 text-center py-6">Cargando comentarios...</div>
                            ) : error ? (
                                <div className="text-sm text-red-400 text-center py-6">{error}</div>
                            ) : comments.length === 0 ? (
                                <div className="text-sm text-neutral-500 text-center py-6">No hay comentarios aun.</div>
                            ) : (
                                comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
                                        {comment.authorSnapshot.photoURL ? (
                                            <img
                                                src={comment.authorSnapshot.photoURL}
                                                alt={comment.authorSnapshot.displayName}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">
                                                {comment.authorSnapshot.displayName.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-white">{comment.authorSnapshot.displayName}</span>
                                                <span className="text-xs text-neutral-500">{formatRelativeTime(comment.createdAt)}</span>
                                            </div>
                                            <p className="text-sm text-neutral-300 mt-1">{comment.text}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {hasMore && (
                            <div className="flex justify-center">
                                <button
                                    onClick={() => void loadComments(true, commentsCursor ?? undefined)}
                                    disabled={loadingMore}
                                    className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {loadingMore ? 'Cargando...' : 'Cargar mas'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="border-t border-neutral-800 p-6 space-y-3 bg-neutral-900/80">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider block">
                        Agregar comentario
                    </label>
                    <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={3}
                        maxLength={1000}
                        disabled={!user || submitting}
                        className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none disabled:opacity-60"
                        placeholder={user ? 'Escribe tu comentario...' : 'Inicia sesion para comentar'}
                    />
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>{message.length}/1000</span>
                        <button
                            type="submit"
                            disabled={!user || submitting}
                            className="px-4 py-2 rounded-lg bg-amber-500 text-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                'Comentar'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PostCommentsModal;
