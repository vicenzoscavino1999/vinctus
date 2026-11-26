import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteNotification,
  getUserActivity,
  markAllNotificationsRead,
  markNotificationRead,
  notifyNotificationsUpdated,
  type ActivityRead,
  type PaginatedResult,
} from '@/features/notifications/api';
import type { ActivityGroup } from '@/features/notifications/model/activityFeed';
import { useToast } from '@/shared/ui/Toast';
import type { BlockedUsers } from '@/features/notifications/hooks/blockedUsers';

type Cursor = PaginatedResult<ActivityRead>['lastDoc'];

const PAGE_SIZE = 20;
/** Pages made only of blocked senders are skipped, up to this many, so the list is not empty. */
const MAX_BLOCKED_SKIP_PAGES = 2;

const byNewest = (a: ActivityRead, b: ActivityRead) =>
  b.createdAt.getTime() - a.createdAt.getTime();

const mergeById = (current: ActivityRead[], incoming: ActivityRead[]): ActivityRead[] => {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id) && seen.add(item.id))];
};

export type ActivityFeed = ReturnType<typeof useActivityFeed>;

/**
 * The signed-in person's activity (likes, comments, follows), page by page and without blocked
 * senders. Marking as read and deleting show at once and are undone when the server refuses.
 */
export function useActivityFeed(uid: string, blocked: BlockedUsers) {
  const { showToast } = useToast();
  const toast = useRef(showToast);
  useEffect(() => {
    toast.current = showToast;
  });

  const [items, setItems] = useState<ActivityRead[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const request = useRef(0);
  const loadingMoreRef = useRef(false);

  const setPending = useCallback(
    (key: string, pending: boolean) =>
      setPendingKeys((previous) => {
        const next = new Set(previous);
        if (pending) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );

  const load = useCallback(
    async (from: Cursor | undefined, refreshBlocked: boolean) => {
      const more = from !== undefined;
      if (more && (!from || loadingMoreRef.current)) return;
      const current = ++request.current;
      if (more) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }
      try {
        const blockedSet = await (refreshBlocked ? blocked.refresh() : blocked.get());
        let next: Cursor | undefined = more ? from : undefined;
        let collected: ActivityRead[] = [];
        let morePages = false;
        let attempts = 0;
        do {
          const page = await getUserActivity(uid, PAGE_SIZE, next ?? undefined);
          if (current !== request.current) return;
          collected = mergeById(
            collected,
            page.items.filter((item) => !blockedSet.has(item.fromUid)),
          );
          next = page.lastDoc ?? undefined;
          morePages = page.hasMore && Boolean(page.lastDoc);
          attempts += 1;
        } while (collected.length === 0 && morePages && attempts <= MAX_BLOCKED_SKIP_PAGES);

        setItems((previous) => (more ? mergeById(previous, collected) : collected));
        setCursor(next ?? null);
        setHasMore(morePages);
        setStatus('ready');
      } catch (error) {
        if (current !== request.current) return;
        console.error('Error loading activity:', error);
        if (more) toast.current('No se pudieron cargar más notificaciones.', 'error');
        else setStatus((previous) => (previous === 'ready' ? previous : 'error'));
      } finally {
        if (more) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [uid, blocked],
  );

  useEffect(() => {
    void load(undefined, false);
  }, [load]);

  const reload = useCallback(() => {
    setStatus((previous) => (previous === 'error' ? 'loading' : previous));
    return load(undefined, true);
  }, [load]);

  const loadMore = useCallback(() => (cursor ? load(cursor, false) : undefined), [cursor, load]);

  const markRead = useCallback(
    async (group: ActivityGroup, silent = false) => {
      const ids = group.unreadIds;
      if (ids.length === 0) return;
      const unread = new Set(ids);
      setPending(group.key, true);
      setItems((previous) =>
        previous.map((item) => (unread.has(item.id) ? { ...item, read: true } : item)),
      );
      try {
        if (ids.length === 1) await markNotificationRead(ids[0], true);
        else await markAllNotificationsRead(ids);
        notifyNotificationsUpdated();
      } catch (error) {
        console.error('Error marking notification as read:', error);
        setItems((previous) =>
          previous.map((item) => (unread.has(item.id) ? { ...item, read: false } : item)),
        );
        if (!silent) toast.current('No se pudo marcar como leída.', 'error');
      } finally {
        setPending(group.key, false);
      }
    },
    [setPending],
  );

  const remove = useCallback(
    async (group: ActivityGroup) => {
      const removed = group.items;
      const ids = new Set(removed.map((item) => item.id));
      setPending(group.key, true);
      setItems((previous) => previous.filter((item) => !ids.has(item.id)));
      const results = await Promise.allSettled(removed.map((item) => deleteNotification(item.id)));
      const failed = removed.filter((_, index) => results[index].status === 'rejected');
      if (failed.length > 0) {
        console.error('Error deleting notification:', results);
        setItems((previous) => mergeById(previous, failed).sort(byNewest));
        toast.current('No se pudo eliminar la notificación.', 'error');
      } else {
        notifyNotificationsUpdated();
        toast.current('Notificación eliminada.', 'info');
      }
      setPending(group.key, false);
    },
    [setPending],
  );

  const markAllRead = useCallback(async () => {
    const ids = items.filter((item) => !item.read).map((item) => item.id);
    if (ids.length === 0 || markingAll) return;
    const unread = new Set(ids);
    setMarkingAll(true);
    setItems((previous) => previous.map((item) => ({ ...item, read: true })));
    try {
      await markAllNotificationsRead(ids);
      notifyNotificationsUpdated();
      toast.current('Notificaciones marcadas como leídas.', 'success');
    } catch (error) {
      console.error('Error marking all notifications read:', error);
      setItems((previous) =>
        previous.map((item) => (unread.has(item.id) ? { ...item, read: false } : item)),
      );
      toast.current('No se pudieron marcar todas como leídas.', 'error');
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll]);

  return {
    items,
    status,
    hasMore,
    loadingMore,
    markingAll,
    pendingKeys,
    reload,
    loadMore,
    markRead,
    remove,
    markAllRead,
  };
}
