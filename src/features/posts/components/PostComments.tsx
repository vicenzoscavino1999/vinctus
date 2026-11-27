import { useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth';
import type { PostCommentRead } from '@/features/posts/api';
import { usePostComments } from '@/features/posts/hooks/usePostComments';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { useToast } from '@/shared/ui/Toast';

type Props = {
  postId: string;
  commentCount: number;
  onCommentAdded: (postId: string) => void;
  onReportComment: (comment: PostCommentRead) => void;
  /** In a sheet the list scrolls and the composer stays at the bottom. */
  layout?: 'page' | 'sheet';
  /** Opens the composer when it mounts (the comment button of the post). */
  composerRequest?: number;
};

/** A round photo, or the initial on the brand gold. */
export function PersonAvatar({
  name,
  photoURL,
  size = 32,
}: {
  name: string;
  photoURL: string | null | undefined;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (photoURL) {
    return (
      <img src={photoURL} alt="" style={style} className="shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-xs font-semibold text-black"
    >
      {name.charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function CommentRow({ comment, onReport }: { comment: PostCommentRead; onReport: () => void }) {
  const name = comment.authorSnapshot.displayName;
  return (
    <li className="flex gap-3 py-3">
      <Link to={`/user/${comment.authorId}`} className="shrink-0" aria-label={`Perfil de ${name}`}>
        <PersonAvatar name={name} photoURL={comment.authorSnapshot.photoURL} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-sm leading-snug text-neutral-200">
          <Link to={`/user/${comment.authorId}`} className="mr-1.5 font-semibold text-white">
            {name}
          </Link>
          <span>{comment.text}</span>
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
          <span>{formatRelativeTime(comment.createdAt)}</span>
          <button
            type="button"
            onClick={onReport}
            className="transition-colors hover:text-neutral-300"
          >
            Reportar
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * The comments of a post: the list (newest pages on demand) and the composer. The same block in
 * the post page and in the feed's comments sheet.
 */
export default function PostComments({
  postId,
  commentCount,
  onCommentAdded,
  onReportComment,
  layout = 'page',
  composerRequest = 0,
}: Props) {
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
  } = usePostComments({ postId, user, initialCount: commentCount, onCommentAdded });
  const editor = useRef<HTMLTextAreaElement>(null);
  const total = commentTotal ?? comments.length;

  useEffect(() => {
    if (composerRequest > 0) setIsComposerOpen(true);
  }, [composerRequest, setIsComposerOpen]);

  useEffect(() => {
    if (isComposerOpen && composerRequest > 0) editor.current?.focus();
  }, [isComposerOpen, composerRequest]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await submitComment()) showToast('Comentario enviado', 'success');
  };

  const isSheet = layout === 'sheet';

  const list = (
    <div className={isSheet ? 'min-h-0 flex-1 overflow-y-auto px-4' : ''}>
      {error && (
        <div role="alert" className="mb-2 text-sm text-red-400">
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
      {loading ? (
        <div role="status" aria-label="Cargando comentarios" className="space-y-4 py-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3" aria-hidden="true">
              <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 && !error ? (
        <p className="py-6 text-center text-sm text-neutral-500">No hay comentarios aun.</p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onReport={() => onReportComment(comment)}
            />
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={() => void loadComments(true)}
            disabled={loadingMore}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Cargando…' : 'Ver comentarios anteriores'}
          </button>
        </div>
      )}
    </div>
  );

  const composer = (
    <div
      className={
        isSheet
          ? 'shrink-0 border-t border-white/[0.06] bg-bg px-4 py-3'
          : 'border-t border-white/[0.06] pt-4'
      }
    >
      {isComposerOpen ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            ref={editor}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={LIMITS.comments.textMaxLength}
            disabled={!user}
            aria-label="Tu comentario"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-neutral-500 transition-colors focus:border-white/25 focus:outline-none disabled:opacity-60"
            placeholder={user ? 'Escribe tu comentario...' : 'Inicia sesion para comentar'}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
            <button
              type="button"
              onClick={() => setIsComposerOpen(false)}
              className="transition-colors hover:text-white"
            >
              Ocultar
            </button>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {message.length}/{LIMITS.comments.textMaxLength}
              </span>
              <button
                type="submit"
                disabled={!user || submitting}
                className="flex items-center gap-2 rounded-full bg-brand-gold px-4 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsComposerOpen(true)}
          className="flex w-full items-center gap-3 text-left"
        >
          <PersonAvatar name={user?.displayName || 'Tú'} photoURL={user?.photoURL} />
          <span className="flex-1 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-neutral-500 transition-colors hover:border-white/20">
            Agregar comentario…
          </span>
        </button>
      )}
    </div>
  );

  return (
    <section
      aria-labelledby={`comments-${postId}`}
      className={isSheet ? 'flex min-h-0 flex-1 flex-col' : ''}
    >
      <h2
        id={`comments-${postId}`}
        className={`font-display text-xl text-white ${isSheet ? 'px-4 pb-1 pt-4' : 'mb-2'}`}
      >
        Comentarios ({total})
      </h2>
      {isSheet ? (
        <>
          {list}
          {composer}
        </>
      ) : (
        <>
          {composer}
          {list}
        </>
      )}
    </section>
  );
}
