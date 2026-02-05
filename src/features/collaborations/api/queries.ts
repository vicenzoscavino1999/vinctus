import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, safeLimitSchema, validate } from '@/shared/lib/validators';

import type { CollaborationRequestRead, CollaborationRead } from './types';

const DEFAULT_LIMIT = 20;
const READ_TIMEOUT_MS = 5000;

type CollaborationPage<T> = {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
};

const normalizeDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value;
};

const normalizeCollaborationMode = (value: unknown): CollaborationRead['mode'] =>
  value === 'presencial' ? 'presencial' : 'virtual';

const normalizeCollaborationLevel = (value: unknown): CollaborationRead['level'] => {
  if (value === 'experto') return 'experto';
  if (value === 'intermedio') return 'intermedio';
  return 'principiante';
};

const normalizeStatus = (value: unknown): CollaborationRead['status'] =>
  value === 'closed' ? 'closed' : 'open';

const buildCollaboration = (collaborationId: string, data: unknown): CollaborationRead => {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const authorSnapshot =
    typeof record.authorSnapshot === 'object' && record.authorSnapshot !== null
      ? (record.authorSnapshot as Record<string, unknown>)
      : {};

  const createdAt = normalizeDate(record.createdAt) ?? new Date(0);
  const updatedAt = normalizeDate(record.updatedAt) ?? createdAt;

  const tags = Array.isArray(record.tags)
    ? record.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
        .slice(0, 6)
    : [];

  return {
    id: collaborationId,
    title: typeof record.title === 'string' ? record.title : '',
    context: typeof record.context === 'string' ? record.context : '',
    seekingRole: typeof record.seekingRole === 'string' ? record.seekingRole : '',
    mode: normalizeCollaborationMode(record.mode),
    location: normalizeText(record.location),
    level: normalizeCollaborationLevel(record.level),
    topic: normalizeText(record.topic),
    tags,
    authorId: typeof record.authorId === 'string' ? record.authorId : '',
    authorSnapshot: {
      displayName:
        typeof authorSnapshot.displayName === 'string' ? authorSnapshot.displayName : 'Usuario',
      photoURL: normalizeText(authorSnapshot.photoURL),
    },
    status: normalizeStatus(record.status),
    createdAt,
    updatedAt,
  };
};

const buildCollaborationRequest = (requestId: string, data: unknown): CollaborationRequestRead => {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const createdAt = normalizeDate(record.createdAt) ?? new Date(0);
  const updatedAt = normalizeDate(record.updatedAt) ?? createdAt;

  const statusValue = record.status;
  const status: CollaborationRequestRead['status'] =
    statusValue === 'accepted' || statusValue === 'rejected' ? statusValue : 'pending';

  return {
    id: requestId,
    collaborationId: typeof record.collaborationId === 'string' ? record.collaborationId : '',
    collaborationTitle:
      typeof record.collaborationTitle === 'string' ? record.collaborationTitle : '',
    fromUid: typeof record.fromUid === 'string' ? record.fromUid : '',
    toUid: typeof record.toUid === 'string' ? record.toUid : '',
    status,
    message: normalizeText(record.message),
    fromUserName: normalizeText(record.fromUserName),
    fromUserPhoto: normalizeText(record.fromUserPhoto),
    createdAt,
    updatedAt,
  };
};

const buildPageResult = <T>(
  docs: DocumentSnapshot[],
  pageSize: number,
  mapper: (docSnap: DocumentSnapshot) => T,
): CollaborationPage<T> => {
  const hasMore = docs.length > pageSize;
  const currentDocs = hasMore ? docs.slice(0, pageSize) : docs;

  return {
    items: currentDocs.map(mapper),
    lastDoc: currentDocs.length > 0 ? currentDocs[currentDocs.length - 1] : null,
    hasMore,
  };
};

export const getCollaborationsPage = async (
  pageSize: number = DEFAULT_LIMIT,
  cursor?: DocumentSnapshot | null,
): Promise<CollaborationPage<CollaborationRead>> => {
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let listQuery = query(
    collection(db, 'collaborations'),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (cursor) {
    listQuery = query(listQuery, startAfter(cursor));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(listQuery), {
        context: { op: 'collaborations.getCollaborationsPage' },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'collaborations.getCollaborationsPage' } },
    );

    trackFirestoreRead('collaborations.getCollaborationsPage', snapshot.size);

    return buildPageResult(snapshot.docs, safeLimit, (docSnap) =>
      buildCollaboration(docSnap.id, docSnap.data()),
    );
  } catch (error) {
    const appError = toAppError(error, { context: { op: 'collaborations.getCollaborationsPage' } });
    const externalCode =
      typeof appError.context?.externalCode === 'string' ? appError.context.externalCode : null;

    if (externalCode !== 'failed-precondition') {
      throw appError;
    }

    let fallbackQuery = query(
      collection(db, 'collaborations'),
      orderBy('createdAt', 'desc'),
      limit(safeLimit * 2),
    );

    if (cursor) {
      fallbackQuery = query(fallbackQuery, startAfter(cursor));
    }

    try {
      const fallbackSnapshot = await withTimeout(
        withRetry(() => getDocs(fallbackQuery), {
          context: { op: 'collaborations.getCollaborationsPage.fallback' },
        }),
        READ_TIMEOUT_MS,
        { context: { op: 'collaborations.getCollaborationsPage.fallback' } },
      );

      trackFirestoreRead('collaborations.getCollaborationsPage.fallback', fallbackSnapshot.size);

      const filtered = fallbackSnapshot.docs
        .map((docSnap) => buildCollaboration(docSnap.id, docSnap.data()))
        .filter((item) => item.status === 'open')
        .slice(0, safeLimit);

      return {
        items: filtered,
        lastDoc:
          fallbackSnapshot.docs.length > 0
            ? fallbackSnapshot.docs[fallbackSnapshot.docs.length - 1]
            : null,
        hasMore: fallbackSnapshot.docs.length > safeLimit,
      };
    } catch (fallbackError) {
      throw toAppError(fallbackError, {
        context: { op: 'collaborations.getCollaborationsPage.fallback' },
      });
    }
  }
};

export const getCollaborations = async (
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollaborationRead[]> => {
  const result = await getCollaborationsPage(limitCount);
  return result.items;
};

export const getPendingCollaborationRequestsPage = async (
  uid: string,
  pageSize: number = DEFAULT_LIMIT,
  cursor?: DocumentSnapshot | null,
): Promise<CollaborationPage<CollaborationRequestRead>> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let listQuery = query(
    collection(db, 'collaboration_requests'),
    where('toUid', '==', safeUid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (cursor) {
    listQuery = query(listQuery, startAfter(cursor));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(listQuery), {
        context: { op: 'collaborations.getPendingCollaborationRequestsPage', uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'collaborations.getPendingCollaborationRequestsPage', uid: safeUid } },
    );

    trackFirestoreRead('collaborations.getPendingCollaborationRequestsPage', snapshot.size);

    return buildPageResult(snapshot.docs, safeLimit, (docSnap) =>
      buildCollaborationRequest(docSnap.id, docSnap.data()),
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'collaborations.getPendingCollaborationRequestsPage', uid: safeUid },
    });
  }
};

export const getPendingCollaborationRequests = async (
  uid: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollaborationRequestRead[]> => {
  const result = await getPendingCollaborationRequestsPage(uid, limitCount);
  return result.items;
};
