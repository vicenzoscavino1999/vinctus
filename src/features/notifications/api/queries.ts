import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimitSchema, validate, z } from '@/shared/lib/validators';

import type { ActivityRead, PaginatedResult } from './types';

const DEFAULT_PAGE_SIZE = 20;
const READ_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const nullableString = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return null;
};

const normalizeActivityType = (value: unknown): ActivityRead['type'] => {
  if (value === 'post_like' || value === 'post_comment' || value === 'follow') return value;
  return 'follow';
};

const buildActivityRead = (id: string, data: unknown): ActivityRead => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  return {
    id,
    type: normalizeActivityType(record.type),
    toUid: typeof record.toUid === 'string' ? record.toUid : '',
    fromUid: typeof record.fromUid === 'string' ? record.fromUid : '',
    fromUserName: nullableString(record.fromUserName),
    fromUserPhoto: nullableString(record.fromUserPhoto),
    postId: nullableString(record.postId),
    postSnippet: nullableString(record.postSnippet),
    commentText: nullableString(record.commentText),
    createdAt: toDate(record.createdAt) ?? new Date(),
    read: record.read === true,
  };
};

export const getUserActivity = async (
  uid: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  lastDoc?: DocumentSnapshot | null,
): Promise<PaginatedResult<ActivityRead>> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(
    collection(db, 'notifications'),
    where('toUid', '==', safeUid),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), {
        context: { op: 'notifications.getUserActivity', uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'notifications.getUserActivity', uid: safeUid } },
    );

    trackFirestoreRead('notifications.getUserActivity', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    return {
      items: docs.map((docSnap) => buildActivityRead(docSnap.id, docSnap.data())),
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'notifications.getUserActivity', uid: safeUid } });
  }
};
