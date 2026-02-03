import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, Heart, Loader2, MessageCircle, User, FileText } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  addPostComment,
  getPostCommentCount,
  getPostComments,
  getPostLikeCount,
  type PaginatedResult,
  type PostCommentRead,
} from '@/features/posts/api';
import { useToast } from '@/shared/ui/Toast';

type PostSummary = {
  postId: string;
  authorName: string;
  authorPhoto: string | null;
  title?: string | null;
  text: string;
  imageUrl: string | null;
  media?: {
    type: 'image' | 'video' | 'file';
    url: string;
    path: string;
    fileName?: string;
    contentType?: string;
    size?: number;
  }[];
  createdAt?: unknown;
};

interface PostCommentsModalProps {
  isOpen: boolean;
  post: PostSummary | null;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
};

const formatRelativeTime = (date: Date | null): string => {
  if (!date) return 'Ahora';
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

const formatBytes = (value: number | undefined): string => {
  if (!value || !Number.isFinite(value)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
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
  const [commentsCursor, setCommentsCursor] =
    useState<PaginatedResult<PostCommentRead>['lastDoc']>(null);
  const [hasMore, setHasMore] = useState(false);
  const [commentTotal, setCommentTotal] = useState<number | null>(null);
  const [likeTotal, setLikeTotal] = useState<number | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const COMMENTS_PAGE_SIZE = 12;

  const loadComments = useCallback(
    async (loadMore = false, cursor?: PaginatedResult<PostCommentRead>['lastDoc']) => {
      if (!post) return;
      try {
        setError(null);
        if (loadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        const [data, total, likes] = await Promise.all([
          getPostComments(
            post.postId,
            COMMENTS_PAGE_SIZE,
            loadMore ? (cursor ?? undefined) : undefined,
          ),
          loadMore ? Promise.resolve(null) : getPostCommentCount(post.postId),
          loadMore ? Promise.resolve(null) : getPostLikeCount(post.postId),
        ]);
        setComments((prev) => (loadMore ? [...prev, ...data.items] : data.items));
        setCommentsCursor(data.lastDoc);
        setHasMore(data.hasMore);
        if (!loadMore && total !== null) {
          setCommentTotal(total);
        }
        if (!loadMore && likes !== null) {
          setLikeTotal(likes);
        }
      } catch (loadError) {
        console.error('Error loading comments:', loadError);
        setError('No se pudieron cargar los comentarios.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [post],
  );

  useEffect(() => {
    if (!isOpen || !post) return;
    setComments([]);
    setCommentsCursor(null);
    setHasMore(false);
    setCommentTotal(null);
    setLikeTotal(null);
    setIsComposerOpen(false);
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
          photoURL: user.photoURL || null,
        },
        trimmed,
      );
      setMessage('');
      showToast('Comentario enviado', 'success');
      onCommentAdded(post.postId);
      await loadComments(false);
      setIsComposerOpen(false);
    } catch (submitError) {
      console.error('Error adding comment:', submitError);
      setError('No se pudo enviar el comentario.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !post) return null;

  const postCreatedAt = toDate(post.createdAt);
  const postTimestamp = postCreatedAt ? formatRelativeTime(postCreatedAt) : null;
  const totalComments = commentTotal ?? comments.length;
  const totalLikes = likeTotal ?? 0;
  const postParagraphs = post.text
    ? post.text
        .split('\n\n')
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [];
  const titleText = post.title?.trim() || '';
  const headline = titleText || postParagraphs[0] || 'Publicacion';
  const bodyParagraphs = titleText ? postParagraphs : postParagraphs.slice(1);
  const hasMedia = !!post.media?.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl mx-4 bg-bg border border-neutral-900 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 md:px-12 py-6 pb-10">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={onClose}
                className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors"
              >
                <ChevronLeft size={18} />
                <span className="text-sm">Volver</span>
              </button>
            </div>

            {headline && (
              <h1 className="text-display-sm md:text-display-md font-display text-white mb-6 leading-tight">
                {headline}
              </h1>
            )}

            {post.media && post.media.length > 0 && (
              <div className="mb-8 space-y-4">
                {post.media.some((item) => item.type === 'image') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {post.media
                      .filter((item) => item.type === 'image')
                      .map((item, index) => (
                        <img
                          key={`${item.path}-${index}`}
                          src={item.url}
                          alt="Adjunto"
                          className="w-full h-56 object-cover rounded-xl border border-neutral-800"
                        />
                      ))}
                  </div>
                )}

                {post.media.some((item) => item.type === 'video') && (
                  <div className="space-y-3">
                    {post.media
                      .filter((item) => item.type === 'video')
                      .map((item, index) => (
                        <video
                          key={`${item.path}-${index}`}
                          src={item.url}
                          controls
                          preload="metadata"
                          className="w-full max-h-[360px] rounded-xl border border-neutral-800 bg-black"
                        />
                      ))}
                  </div>
                )}

                {post.media.some((item) => item.type === 'file') && (
                  <div className="space-y-2">
                    {post.media
                      .filter((item) => item.type === 'file')
                      .map((item, index) => (
                        <a
                          key={`${item.path}-${index}`}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 hover:border-neutral-700 transition-colors"
                        >
                          <div className="flex items-center gap-2 text-sm text-neutral-200">
                            <FileText size={16} className="text-emerald-300" />
                            <span className="truncate">{item.fileName || 'Archivo adjunto'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            {item.size ? formatBytes(item.size) : ''}
                          </div>
                        </a>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
                {post.authorPhoto ? (
                  <img
                    src={post.authorPhoto}
                    alt={post.authorName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={20} className="text-neutral-500" />
                )}
              </div>
              <div>
                <p className="text-white font-medium">{post.authorName}</p>
                <p className="text-neutral-500 text-sm">
                  {postTimestamp ? `Publicado - ${postTimestamp}` : 'Publicado recientemente'}
                </p>
              </div>
            </div>

            {!hasMedia && post.imageUrl && (
              <div className="relative rounded-xl overflow-hidden mb-8 aspect-video bg-surface-overlay">
                <img src={post.imageUrl} alt="Post" className="w-full h-full object-cover" />
              </div>
            )}

            {bodyParagraphs.length > 0 && (
              <article className="prose prose-invert max-w-none mb-8">
                {bodyParagraphs.map((paragraph, idx) => (
                  <p key={idx} className="text-neutral-300 text-body-md leading-relaxed mb-4">
                    {paragraph}
                  </p>
                ))}
              </article>
            )}

            <div className="flex items-center justify-between py-4 border-t border-b border-neutral-800/50">
              <div className="flex items-center gap-6 text-neutral-500">
                <div className="flex items-center gap-2">
                  <Heart size={20} />
                  <span className="text-sm">{totalLikes}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle size={20} />
                  <span className="text-sm">{totalComments}</span>
                </div>
              </div>
            </div>

            <section className="mt-8">
              <h2 className="text-heading-lg font-display text-white mb-4">
                Comentarios ({totalComments})
              </h2>
              <div className="bg-surface-overlay border border-neutral-800 rounded-card p-6 md:p-8">
                {loading ? (
                  <div className="text-sm text-neutral-500 text-center py-6">
                    Cargando comentarios...
                  </div>
                ) : error ? (
                  <div className="text-sm text-red-400 text-center py-6">{error}</div>
                ) : comments.length === 0 ? (
                  <div className="text-sm text-neutral-500 text-center py-6">
                    No hay comentarios aun.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="flex gap-3 rounded-xl border border-neutral-800/70 bg-neutral-900/30 p-4"
                      >
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
                            <span className="text-sm text-white">
                              {comment.authorSnapshot.displayName}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {formatRelativeTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-300 mt-1">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => void loadComments(true, commentsCursor ?? undefined)}
                    disabled={loadingMore}
                    className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? 'Cargando...' : 'Cargar mas'}
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="border-t border-neutral-800/60 bg-bg/95">
          {isComposerOpen ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-neutral-500 uppercase tracking-wider block">
                  Agregar comentario
                </label>
                <button
                  type="button"
                  onClick={() => setIsComposerOpen(false)}
                  className="text-xs text-neutral-500 hover:text-white transition-colors"
                >
                  Ocultar
                </button>
              </div>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={1000}
                disabled={!user || submitting}
                className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none disabled:opacity-60"
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
          ) : (
            <button
              type="button"
              onClick={() => setIsComposerOpen(true)}
              className="w-full px-6 py-5 text-left text-neutral-500 hover:text-white transition-colors"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
                <span>Agregar comentario</span>
                <span>Tocar para escribir</span>
              </div>
              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-500">
                Escribe tu comentario...
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostCommentsModal;
