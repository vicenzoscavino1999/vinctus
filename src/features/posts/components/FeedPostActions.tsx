import { useEffect } from 'react';
import { Bookmark, Heart, Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { triggerSelectionHaptic } from '@/shared/lib/haptics';
import { usePostEngagement } from '@/features/posts/hooks/usePostEngagement';
import { reactionLabel } from '@/features/posts/model/PostEngagementSession';

type Props = {
  postId: string;
  initialCount: number;
  commentCount: number;
  onComments: () => void;
  onLikeCount: (postId: string, count: number) => void;
};

export default function FeedPostActions({
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
  }, [like.count, like.loaded, onLikeCount, postId]);
  const action = (kind: 'like' | 'save') => {
    if (!user) {
      showToast('Inicia sesión para continuar', 'info');
      return;
    }
    if (kind === 'like') void triggerSelectionHaptic();
    void act(kind);
  };
  const error = like.error || save.error;
  return (
    <>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-10">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            action('like');
          }}
          disabled={like.loading}
          aria-label={reactionLabel('like', like)}
          aria-pressed={like.value ?? undefined}
          aria-busy={like.loading}
          className="flex flex-col items-center gap-1 text-neutral-200/80 hover:text-white transition-colors disabled:opacity-60"
        >
          {like.loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Heart size={20} fill={like.value ? 'currentColor' : 'none'} />
          )}
          <span className="text-xs">{like.loaded ? like.count : initialCount}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onComments();
          }}
          className="flex flex-col items-center gap-1 text-neutral-200/80 hover:text-white"
          aria-label="Comentarios"
        >
          <MessageCircle size={20} />
          <span className="text-xs">{commentCount}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            action('save');
          }}
          disabled={save.loading}
          aria-label={reactionLabel('save', save)}
          aria-pressed={save.value ?? undefined}
          aria-busy={save.loading}
          className={`flex flex-col items-center gap-1 transition-colors disabled:opacity-60 ${save.value ? 'text-amber-300' : 'text-neutral-200/80 hover:text-white'}`}
        >
          {save.loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Bookmark size={20} fill={save.value ? 'currentColor' : 'none'} />
          )}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="absolute left-4 right-16 bottom-3 rounded bg-black/90 px-3 py-2 text-xs text-red-300 z-20"
        >
          {error}
        </p>
      )}
    </>
  );
}
