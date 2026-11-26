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
  // One row under the post, in the same order as the native app's feed card: like, comments, save.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-5">
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
          className={`flex items-center gap-1.5 rounded-full py-1 text-sm transition-colors disabled:opacity-60 ${
            like.value ? 'text-red-400' : 'text-neutral-200 hover:text-white'
          }`}
        >
          {like.loading ? (
            <Loader2 size={19} className="animate-spin" />
          ) : (
            <Heart size={19} fill={like.value ? 'currentColor' : 'none'} />
          )}
          <span className="tabular-nums">{like.loaded ? like.count : initialCount}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onComments();
          }}
          className="flex items-center gap-1.5 rounded-full py-1 text-sm text-neutral-200 transition-colors hover:text-white"
          aria-label="Comentarios"
        >
          <MessageCircle size={19} />
          <span className="tabular-nums">{commentCount}</span>
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
          className={`flex items-center rounded-full py-1 transition-colors disabled:opacity-60 ${save.value ? 'text-amber-300' : 'text-neutral-200 hover:text-white'}`}
        >
          {save.loading ? (
            <Loader2 size={19} className="animate-spin" />
          ) : (
            <Bookmark size={19} fill={save.value ? 'currentColor' : 'none'} />
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded bg-black/80 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
