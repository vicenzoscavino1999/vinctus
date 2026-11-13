import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Heart, Loader2, MessageCircle, User, FileText } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  createPostCommentReport,
  createPostReport,
  type PostCommentRead,
  type UserReportReason,
} from '@/features/posts/api';
import ContentReportModal from '@/features/posts/components/ContentReportModal';
import { usePostComments } from '@/features/posts/hooks/usePostComments';
import type { PostSummary } from '@/features/posts/model/postSummary';
import { useToast } from '@/shared/ui/Toast';
import { formatRelativeTime, formatBytes } from '@/shared/lib/formatUtils';
import { parseYouTubeUrl } from '@/shared/lib/youtube';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface PostCommentsModalProps {
  isOpen: boolean;
  post: PostSummary | null;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}

type ReportTarget =
  | {
      type: 'post';
      postId: string;
      postAuthorId: string | null;
    }
  | {
      type: 'comment';
      postId: string;
      commentId: string;
      commentAuthorId: string | null;
    };

// toDate, formatRelativeTime, formatBytes imported from @/shared/lib/formatUtils

const PostCommentsModal = (props: PostCommentsModalProps) => {
  const { user } = useAuth();
  if (!props.isOpen || !props.post) return null;
  return createPortal(
    <PostCommentsSession
      key={`${props.post.postId}:${user?.uid ?? 'anonymous'}`}
      {...props}
      post={props.post}
    />,
    document.body,
  );
};

const PostCommentsSession = ({
  post,
  onClose,
  onCommentAdded,
}: Omit<PostCommentsModalProps, 'post'> & { post: PostSummary }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    comments,
    message,
    setMessage,
    loading,
    loadingMore,
    submitting,
    error,
    hasMore,
    commentTotal,
    isComposerOpen,
    setIsComposerOpen,
    loadComments,
    submitComment,
  } = usePostComments({
    postId: post.postId,
    user,
    initialCount: post.commentCount,
    onCommentAdded,
  });
  const likeTotal = post.likeCount;
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<UserReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await submitComment()) showToast('Comentario enviado', 'success');
  };

  const openPostReport = () => {
    if (!post) return;
    if (!user) {
      showToast('Inicia sesion para reportar', 'info');
      return;
    }
    setReportTarget({
      type: 'post',
      postId: post.postId,
      postAuthorId: post.authorId || null,
    });
    setReportReason('spam');
    setReportDetails('');
    setReportError(null);
  };

  const openCommentReport = (comment: PostCommentRead) => {
    if (!post) return;
    if (!user) {
      showToast('Inicia sesion para reportar', 'info');
      return;
    }
    setReportTarget({
      type: 'comment',
      postId: post.postId,
      commentId: comment.id,
      commentAuthorId: comment.authorId || null,
    });
    setReportReason('spam');
    setReportDetails('');
    setReportError(null);
  };

  const handleSubmitReport = async () => {
    if (!post || !user || !reportTarget) return;
    setSubmittingReport(true);
    setReportError(null);
    try {
      const details = reportDetails.trim() ? reportDetails.trim() : null;
      if (reportTarget.type === 'post') {
        await createPostReport({
          reporterUid: user.uid,
          postId: reportTarget.postId,
          postAuthorId: reportTarget.postAuthorId,
          reason: reportReason,
          details,
        });
      } else {
        await createPostCommentReport({
          reporterUid: user.uid,
          postId: reportTarget.postId,
          commentId: reportTarget.commentId,
          commentAuthorId: reportTarget.commentAuthorId,
          reason: reportReason,
          details,
        });
      }
      showToast('Reporte enviado', 'success');
      setReportTarget(null);
      setReportReason('spam');
      setReportDetails('');
      setReportError(null);
    } catch (submitError) {
      console.error('Error creating content report:', submitError);
      setReportError('No se pudo enviar el reporte.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const postTimestamp = post.createdAt ? formatRelativeTime(post.createdAt) : null;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comentarios de la publicación"
        className="relative w-full max-w-5xl mx-4 bg-bg border border-neutral-900 rounded-2xl overflow-hidden max-h-[90dvh] flex flex-col"
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
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
                      .map((item, index) => {
                        const youtubeMeta = parseYouTubeUrl(item.url);
                        if (youtubeMeta) {
                          return (
                            <div
                              key={`${item.path}-${index}`}
                              className="w-full max-h-[360px] rounded-xl border border-neutral-800 bg-black overflow-hidden aspect-video"
                            >
                              <iframe
                                src={youtubeMeta.embedUrl}
                                title={item.fileName || `video-${index + 1}`}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="w-full h-full"
                              />
                            </div>
                          );
                        }

                        return (
                          <video
                            key={`${item.path}-${index}`}
                            src={item.url}
                            controls
                            preload="metadata"
                            className="w-full max-h-[360px] rounded-xl border border-neutral-800 bg-black"
                          />
                        );
                      })}
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
              <button
                type="button"
                onClick={openPostReport}
                className="text-xs uppercase tracking-widest text-red-300 hover:text-red-200 transition-colors"
              >
                Reportar publicacion
              </button>
            </div>

            {error && (
              <div role="alert" className="mt-4 text-sm text-red-400">
                {error}
                <button
                  type="button"
                  onClick={() => void loadComments()}
                  disabled={loading || submitting}
                  className="ml-3 underline"
                >
                  Reintentar carga
                </button>
              </div>
            )}
            <section className="mt-8">
              <h2 className="text-heading-lg font-display text-white mb-4">
                Comentarios ({totalComments})
              </h2>
              <div className="bg-surface-overlay border border-neutral-800 rounded-card p-6 md:p-8">
                {loading ? (
                  <div className="text-sm text-neutral-500 text-center py-6">
                    Cargando comentarios...
                  </div>
                ) : error && comments.length === 0 ? (
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
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white">
                                {comment.authorSnapshot.displayName}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatRelativeTime(comment.createdAt)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openCommentReport(comment)}
                              className="text-[11px] uppercase tracking-[0.18em] text-red-300/80 hover:text-red-200 transition-colors"
                            >
                              Reportar
                            </button>
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
                    onClick={() => void loadComments(true)}
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

        <div className="shrink-0 border-t border-neutral-800/60 bg-bg/95">
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
                maxLength={LIMITS.comments.textMaxLength}
                disabled={!user}
                className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none disabled:opacity-60"
                placeholder={user ? 'Escribe tu comentario...' : 'Inicia sesion para comentar'}
              />
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {message.length}/{LIMITS.comments.textMaxLength}
                </span>
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
      <ContentReportModal
        open={!!reportTarget}
        targetLabel={reportTarget?.type === 'comment' ? 'comentario' : 'publicacion'}
        reason={reportReason}
        details={reportDetails}
        error={reportError}
        isSubmitting={submittingReport}
        onClose={() => {
          if (submittingReport) return;
          setReportTarget(null);
          setReportError(null);
          setReportDetails('');
          setReportReason('spam');
        }}
        onReasonChange={setReportReason}
        onDetailsChange={setReportDetails}
        onSubmit={() => {
          void handleSubmitReport();
        }}
      />
    </div>
  );
};

export default PostCommentsModal;
