import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBlockedUsers,
  getSavedPosts,
  type PaginatedResult,
  type PostRead,
} from '@/features/posts/api';

export function useSavedPosts(uid: string) {
  const [items, setItems] = useState<PostRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMore, setFailedMore] = useState(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const busy = useRef(false);
  const cursor = useRef<PaginatedResult<PostRead>['lastDoc']>(null);
  const load = useCallback(
    async (more = false) => {
      if (more && (busy.current || !cursor.current)) return;
      const generation = ++request.current;
      busy.current = true;
      setLoading(!more);
      setLoadingMore(more);
      setError(null);
      try {
        const [page, blocked] = await Promise.all([
          getSavedPosts(uid, 12, more ? (cursor.current ?? undefined) : undefined),
          getBlockedUsers(uid),
        ]);
        if (!mounted.current || generation !== request.current) return;
        const hidden = new Set(blocked);
        const visible = page.items.filter((post) => !hidden.has(post.authorId));
        setItems((previous) =>
          Array.from(
            new Map(
              (more ? [...previous, ...visible] : visible).map((post) => [post.postId, post]),
            ).values(),
          ),
        );
        cursor.current = page.lastDoc;
        setHasMore(page.hasMore);
      } catch {
        if (!mounted.current || generation !== request.current) return;
        setFailedMore(more);
        setError('No se pudieron cargar las publicaciones guardadas. Reintenta.');
      } finally {
        if (mounted.current && generation === request.current) {
          busy.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [uid],
  );
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [load]);
  return { items, loading, loadingMore, hasMore, error, load, retry: () => load(failedMore) };
}
