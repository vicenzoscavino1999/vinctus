import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/context/auth';
import PostComments, { PersonAvatar } from '@/features/posts/components/PostComments';
import { useContentReport } from '@/features/posts/hooks/useContentReport';
import type { PostSummary } from '@/features/posts/model/postSummary';

interface PostCommentsModalProps {
  isOpen: boolean;
  post: PostSummary | null;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}

/**
 * The feed's comments sheet, like Instagram's: the caption on top, the comments, and the composer
 * at the bottom. A bottom sheet on phones, a centered panel on wider screens. The whole post is on
 * its own page ("Ver publicación").
 */
const PostCommentsModal = (props: PostCommentsModalProps) => {
  const { user } = useAuth();
  if (!props.isOpen || !props.post) return null;
  return createPortal(
    <PostCommentsSheet
      key={`${props.post.postId}:${user?.uid ?? 'anonymous'}`}
      post={props.post}
      onClose={props.onClose}
      onCommentAdded={props.onCommentAdded}
    />,
    document.body,
  );
};

function PostCommentsSheet({
  post,
  onClose,
  onCommentAdded,
}: {
  post: PostSummary;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}) {
  const report = useContentReport();
  const caption = [post.title?.trim(), post.text.trim()].filter(Boolean).join(' · ');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comentarios de la publicación"
        className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-bg pb-[env(safe-area-inset-bottom)] md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-3xl md:pb-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar comentarios"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X size={18} />
        </button>

        {/* The caption, with the way to the full post and to report it. */}
        <div className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4">
          <div className="flex gap-3 pr-10">
            <PersonAvatar name={post.authorName} photoURL={post.authorPhoto} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm leading-snug text-neutral-200">
                <span className="mr-1.5 font-semibold text-white">{post.authorName}</span>
                {caption}
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                <Link
                  to={`/post/${post.postId}`}
                  onClick={onClose}
                  className="font-medium text-brand-gold transition-colors hover:text-brand-gold-light"
                >
                  Ver publicación
                </Link>
                <button
                  type="button"
                  onClick={() => report.reportPost(post.postId, post.authorId)}
                  className="transition-colors hover:text-neutral-300"
                >
                  Reportar publicacion
                </button>
              </div>
            </div>
          </div>
        </div>

        <PostComments
          postId={post.postId}
          commentCount={post.commentCount}
          onCommentAdded={onCommentAdded}
          onReportComment={(comment) => report.reportComment(post.postId, comment)}
          layout="sheet"
        />
      </div>
      {report.modal}
    </div>
  );
}

export default PostCommentsModal;
