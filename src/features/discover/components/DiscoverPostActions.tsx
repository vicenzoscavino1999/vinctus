import { useEffect } from 'react';
import { Bookmark, Heart, Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { usePostEngagement } from '@/features/posts/hooks/usePostEngagement';
import { reactionLabel } from '@/features/posts/model/PostEngagementSession';

type Props = {
  postId: string;
  initialCount: number;
  commentCount: number;
  onComments: () => void;
  onLikeCount: (postId: string, count: number) => void;
};

const buttonClass =
  'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] tabular-nums transition-colors hover:bg-white/[0.06] disabled:opacity-60';
const idleClass = 'text-neutral-300 hover:text-white';

export default function DiscoverPostActions({
  postId,
  initialCount,
  commentCount,
  onComments,
  onLikeCount,
}: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { like, save, act } = usePostEngagement(postId, user?.uid, initialCount);
  useEffect(() => {
    if (like.loaded) onLikeCount(postId, like.count);
  }, [postId, like.loaded, like.count, onLikeCount]);
  const action = (kind: 'like' | 'save') => {
    if (!user) {
      showToast('Inicia sesión para continuar', 'info');
      return;
    }
    void act(kind);
  };
  const error = like.error || save.error;
  return (
    <>
      <div
        role="group"
        aria-label="Acciones de la publicación"
        className="-mx-2 flex items-center gap-0.5"
      >
        <button
          type="button"
          onClick={() => action('like')}
          disabled={like.loading}
          aria-label={reactionLabel('like', like)}
          aria-pressed={like.value ?? undefined}
          aria-busy={like.loading}
          className={`${buttonClass} ${like.value ? 'text-red-400' : idleClass}`}
        >
          {like.loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Heart size={18} strokeWidth={1.8} fill={like.value ? 'currentColor' : 'none'} />
          )}
          <span>{like.loaded ? like.count : initialCount}</span>
        </button>
        <button
          type="button"
          onClick={onComments}
          aria-label={`Comentarios: ${commentCount}`}
          className={`${buttonClass} ${idleClass}`}
        >
          <MessageCircle size={18} strokeWidth={1.8} />
          <span>{commentCount}</span>
        </button>
        <button
          type="button"
          onClick={() => action('save')}
          disabled={save.loading}
          aria-label={reactionLabel('save', save)}
          aria-pressed={save.value ?? undefined}
          aria-busy={save.loading}
          className={`${buttonClass} ml-auto ${save.value ? 'text-brand-gold' : idleClass}`}
        >
          {save.loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Bookmark size={18} strokeWidth={1.8} fill={save.value ? 'currentColor' : 'none'} />
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </>
  );
}
