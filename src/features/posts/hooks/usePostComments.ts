import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPostComment,
  getNewPostId,
  getPostComments,
  type PaginatedResult,
  type PostCommentRead,
} from '@/features/posts/api';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

type CommentUser = { uid: string; displayName: string | null; photoURL: string | null };
type Options = {
  postId: string;
  user: CommentUser | null;
  initialCount: number | null;
  onCommentAdded: (postId: string) => void;
};

// One mounted session per post/account. The modal keys this session so delayed
// reads and writes from a closed post cannot change the next post's composer.
export function usePostComments({ postId, user, initialCount, onCommentAdded }: Options) {
  const [comments, setComments] = useState<PostCommentRead[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [commentTotal, setCommentTotal] = useState(initialCount);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const loadingPage = useRef(false);
  const sending = useRef(false);
  const cursor = useRef<PaginatedResult<PostCommentRead>['lastDoc']>(null);
  const pending = useRef<{ text: string; id: string } | null>(null);

  useEffect(() => {
    // Reconcile a new parent/server count without resetting the editor or the
    // loaded pages. A reload with the same count must keep the local increment.
    setCommentTotal(initialCount);
  }, [initialCount]);

  const loadComments = useCallback(
    async (more = false) => {
      if (more && loadingPage.current) return;
      const generation = ++request.current;
      loadingPage.current = true;
      setError(null);
      setLoading(!more);
      setLoadingMore(more);
      try {
        const page = await getPostComments(
          postId,
          12,
          more ? (cursor.current ?? undefined) : undefined,
        );
        if (!mounted.current || generation !== request.current) return;
        setComments((previous) =>
          Array.from(
            new Map(
              (more ? [...previous, ...page.items] : page.items).map((c) => [c.id, c]),
            ).values(),
          ),
        );
        cursor.current = page.lastDoc;
        setHasMore(page.hasMore);
      } catch {
        if (mounted.current && generation === request.current) {
          setError('No se pudieron cargar los comentarios. Puedes reintentar.');
        }
      } finally {
        if (mounted.current && generation === request.current) {
          loadingPage.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [postId],
  );

  useEffect(() => {
    mounted.current = true;
    void loadComments();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [loadComments]);

  const submitComment = async (): Promise<boolean> => {
    if (sending.current) return false;
    if (!user) {
      setError('Inicia sesión para comentar.');
      return false;
    }
    const text = message.trim();
    if (!text || text.length > LIMITS.comments.textMaxLength) {
      setError(!text ? 'Escribe un comentario.' : 'El comentario supera el límite permitido.');
      return false;
    }
    sending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (pending.current?.text !== text) pending.current = { text, id: getNewPostId() };
      await addPostComment(
        postId,
        user.uid,
        { displayName: user.displayName || 'Usuario', photoURL: user.photoURL || null },
        text,
        pending.current.id,
      );
      if (!mounted.current) return false;
      pending.current = null;
      setMessage((current) => (current.trim() === text ? '' : current));
      setCommentTotal((total) => (total ?? comments.length) + 1);
      onCommentAdded(postId);
      await loadComments();
      // The editor stays open, including if the user began another comment.
      return mounted.current;
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : 'No se pudo enviar el comentario.');
      }
      return false;
    } finally {
      sending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  return {
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
  };
}
