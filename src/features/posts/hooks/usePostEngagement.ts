import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  isPostLiked,
  isPostSaved,
  likePostWithSync,
  unlikePostWithSync,
  savePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api';
import {
  PostEngagementSession,
  type ReactionIO,
} from '@/features/posts/model/PostEngagementSession';

const io: ReactionIO = {
  read: (kind, postId, uid) =>
    kind === 'like' ? isPostLiked(postId, uid) : isPostSaved(postId, uid),
  write: (kind, desired, postId, uid) =>
    kind === 'like'
      ? desired
        ? likePostWithSync(postId, uid)
        : unlikePostWithSync(postId, uid)
      : desired
        ? savePostWithSync(postId, uid)
        : unsavePostWithSync(postId, uid),
};

export function usePostEngagement(
  postId: string | undefined,
  uid: string | undefined,
  count: number,
) {
  const session = useMemo(() => new PostEngagementSession(postId, uid, io), [postId, uid]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    session.open();
    return () => session.close();
  }, [session]);
  useEffect(() => {
    session.syncCount(count);
    void session.load('like', count);
    void session.load('save', 0);
  }, [session, count]);
  return { ...state, act: (kind: 'like' | 'save') => session.act(kind) };
}
