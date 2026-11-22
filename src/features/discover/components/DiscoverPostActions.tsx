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
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60';
const idleClass = 'border-neutral-700 bg-neutral-900/70 text-neutral-200 hover:border-neutral-500';

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
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          onClick={() => action('like')}
          disabled={like.loading}
          aria-label={reactionLabel('like', like)}
          aria-pressed={like.value ?? undefined}
          aria-busy={like.loading}
          className={`${buttonClass} ${like.value ? 'border-red-400/60 bg-red-500/15 text-red-300' : idleClass}`}
        >
          {like.loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Heart size={13} fill={like.value ? 'currentColor' : 'none'} />
          )}
          <span>{like.loaded ? like.count : initialCount}</span>
        </button>
        <button
          type="button"
          onClick={onComments}
          aria-label={`Comentarios: ${commentCount}`}
          className={`${buttonClass} ${idleClass}`}
        >
          <MessageCircle size={13} />
          {commentCount}
        </button>
        <button
          type="button"
          onClick={() => action('save')}
          disabled={save.loading}
          aria-label={reactionLabel('save', save)}
          aria-pressed={save.value ?? undefined}
          aria-busy={save.loading}
          className={`${buttonClass} ${save.value ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold' : idleClass}`}
        >
          {save.loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Bookmark size={13} fill={save.value ? 'currentColor' : 'none'} />
          )}
          {save.value ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      {error && (
        <p role="alert" className="order-last w-full text-xs text-red-300">
          {error}
        </p>
      )}
    </>
  );
}
