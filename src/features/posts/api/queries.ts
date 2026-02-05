export {
  getBlockedUsers,
  getFriendIds,
  getPost,
  getPostCommentCount,
  getPostComments,
  getPostLikeCount,
  getPostsByUser,
  getStoriesForOwners,
  isPostLiked,
  isPostSaved,
} from '@/shared/lib/firestore';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, safeLimitSchema, validate } from '@/shared/lib/validators';

import type { FeedPost, PaginatedResult, PostMedia } from './types';

const DEFAULT_PAGE_SIZE = 20;
const READ_TIMEOUT_MS = 5000;

const normalizeCount = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
};

const normalizeNullableString = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
};

const parsePostMedia = (value: unknown): PostMedia[] => {
  if (!Array.isArray(value)) return [];

  const items: PostMedia[] = [];
  value.forEach((raw) => {
    if (typeof raw !== 'object' || raw === null) return;
    const record = raw as Record<string, unknown>;
    const type = record.type;
    if (type !== 'image' && type !== 'video' && type !== 'file') return;

    const url = typeof record.url === 'string' ? record.url : '';
    const path = typeof record.path === 'string' ? record.path : '';
    const contentType = typeof record.contentType === 'string' ? record.contentType : '';

    items.push({
      type,
      url,
      path,
      contentType,
      width: typeof record.width === 'number' ? record.width : undefined,
      height: typeof record.height === 'number' ? record.height : undefined,
      fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
      size: typeof record.size === 'number' ? record.size : undefined,
    });
  });

  return items;
};

const buildFeedPost = (postId: string, data: unknown): FeedPost => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  const rawStatus = record.status;
  const status: FeedPost['status'] =
    rawStatus === 'uploading' || rawStatus === 'failed' || rawStatus === 'ready'
      ? rawStatus
      : 'ready';

  const authorSnapshot =
    typeof record.authorSnapshot === 'object' && record.authorSnapshot !== null
      ? (record.authorSnapshot as Record<string, unknown>)
      : null;

  const authorName =
    (authorSnapshot &&
      typeof authorSnapshot.displayName === 'string' &&
      authorSnapshot.displayName.trim()) ||
    (typeof record.authorName === 'string' && record.authorName.trim()) ||
    'Usuario';

  let snapshotPhoto: string | null | undefined = undefined;
  if (authorSnapshot && 'photoURL' in authorSnapshot) {
    snapshotPhoto = normalizeNullableString(authorSnapshot.photoURL);
  }
  const legacyPhoto = normalizeNullableString(record.authorPhoto);
  const authorPhoto = snapshotPhoto !== undefined ? snapshotPhoto : (legacyPhoto ?? null);

  const title = typeof record.title === 'string' ? record.title : null;
  const text =
    typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : '';

  const media = parsePostMedia(record.media);

  const likeCount = normalizeCount(record.likeCount) ?? normalizeCount(record.likesCount) ?? 0;
  const commentCount =
    normalizeCount(record.commentCount) ?? normalizeCount(record.commentsCount) ?? 0;

  const authorId = typeof record.authorId === 'string' ? record.authorId : null;
  const createdAt: unknown = record.createdAt;

  return {
    postId,
    authorId,
    authorName,
    authorPhoto,
    title,
    text,
    status,
    media,
    createdAt,
    likeCount,
    commentCount,
  };
};

export const getFeedPostsPage = async (
  pageSize: number = DEFAULT_PAGE_SIZE,
  cursor?: DocumentSnapshot | null,
): Promise<PaginatedResult<FeedPost>> => {
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(safeLimit + 1));
  if (cursor) q = query(q, startAfter(cursor));

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'posts.getFeedPostsPage' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'posts.getFeedPostsPage' } },
    );

    trackFirestoreRead('posts.getFeedPostsPage', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    const items = docs
      .map((docSnap) => buildFeedPost(docSnap.id, docSnap.data()))
      .filter((post) => post.status === 'ready');

    return {
      items,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'posts.getFeedPostsPage' } });
  }
};

export const getFeedPostById = async (postId: string): Promise<FeedPost | null> => {
  const id = validate(idSchema, postId, { context: { postId } });

  try {
    const docSnap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'posts', id)), { context: { op: 'posts.getFeedPostById' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'posts.getFeedPostById' } },
    );

    trackFirestoreRead('posts.getFeedPostById');

    if (!docSnap.exists()) return null;

    const post = buildFeedPost(docSnap.id, docSnap.data());
    if (post.status !== 'ready') return null;
    return post;
  } catch (error) {
    const appError = toAppError(error, { context: { op: 'posts.getFeedPostById', postId: id } });
    if (appError.code === 'NOT_FOUND') return null;
    throw appError;
  }
};
