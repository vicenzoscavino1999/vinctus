import {
  collection,
  doc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc as _updateDoc,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const DEFAULT_LIMIT = 25;

export type ModerationQueueStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';
export type ModerationQueuePriority = 'low' | 'medium' | 'high';
export type ModerationQueueTargetType = 'user' | 'group' | 'post' | 'comment' | 'unknown';

export interface ModerationQueueItemRead {
  id: string;
  reportId: string;
  reportPath: string | null;
  reporterUid: string | null;
  reportedUid: string | null;
  reason: string;
  details: string | null;
  conversationId: string | null;
  source: string;
  targetType: ModerationQueueTargetType;
  priority: ModerationQueuePriority;
  status: ModerationQueueStatus;
  reviewAction: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ModerationQueueWrite {
  status: ModerationQueueStatus;
  reviewAction: string;
  reviewNote?: string | null;
  reviewedBy: string;
}

export interface PaginatedResultModel<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

const toDate = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
};

const parsePriority = (value: unknown): ModerationQueuePriority => {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
};

const parseStatus = (value: unknown): ModerationQueueStatus => {
  if (value === 'pending' || value === 'in_review' || value === 'resolved' || value === 'dismissed')
    return value;
  return 'pending';
};

const parseTargetType = (value: unknown): ModerationQueueTargetType => {
  if (value === 'user' || value === 'group' || value === 'post' || value === 'comment')
    return value;
  return 'unknown';
};

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

const getDocs = ((...args: unknown[]) => {
  const result = (_getDocs as (...innerArgs: unknown[]) => unknown)(...args);

  if (
    typeof result === 'object' &&
    result !== null &&
    'then' in result &&
    typeof (result as Promise<unknown>).then === 'function'
  ) {
    return (result as Promise<unknown>).then((snapshot) => {
      const size = (snapshot as { size?: unknown }).size;
      const safeSize =
        typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
      trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
      return snapshot;
    });
  }

  const size = (result as { size?: unknown }).size;
  const safeSize =
    typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
  trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
  return result;
}) as typeof _getDocs;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

export async function isAppAdmin(uid: string): Promise<boolean> {
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'app_admins', uid));
  return snap.exists();
}

export async function getModerationQueue(
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResultModel<ModerationQueueItemRead>> {
  let q = query(
    collection(db, 'moderation_queue'),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      reportId: typeof data.reportId === 'string' ? data.reportId : docSnap.id,
      reportPath: typeof data.reportPath === 'string' ? data.reportPath : null,
      reporterUid: typeof data.reporterUid === 'string' ? data.reporterUid : null,
      reportedUid: typeof data.reportedUid === 'string' ? data.reportedUid : null,
      reason: typeof data.reason === 'string' ? data.reason : 'other',
      details: typeof data.details === 'string' ? data.details : null,
      conversationId: typeof data.conversationId === 'string' ? data.conversationId : null,
      source: typeof data.source === 'string' ? data.source : 'unknown',
      targetType: parseTargetType(data.targetType),
      priority: parsePriority(data.priority),
      status: parseStatus(data.status),
      reviewAction: typeof data.reviewAction === 'string' ? data.reviewAction : null,
      reviewNote: typeof data.reviewNote === 'string' ? data.reviewNote : null,
      reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : null,
      reviewedAt: toDate(data.reviewedAt),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } satisfies ModerationQueueItemRead;
  });

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

export async function updateModerationQueueItem(
  itemId: string,
  input: ModerationQueueWrite,
): Promise<void> {
  await updateDoc(doc(db, 'moderation_queue', itemId), {
    status: input.status,
    reviewAction: input.reviewAction,
    reviewNote: input.reviewNote ?? null,
    reviewedBy: input.reviewedBy,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
