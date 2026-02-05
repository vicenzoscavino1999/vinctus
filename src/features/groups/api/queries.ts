export { getFollowing, getPendingGroupJoinRequests, getUserProfile } from '@/shared/lib/firestore';

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
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
import { idSchema, safeLimitSchema, validate } from '@/shared/lib/validators';

import type {
  FirestoreGroup,
  GroupJoinStatus,
  GroupMemberRead,
  PaginatedResult,
  PostRead,
} from './types';

const DEFAULT_PAGE_SIZE = 30;
const READ_TIMEOUT_MS = 5000;

const normalizeCount = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
};

const normalizeNullableString = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

const buildFirestoreGroup = (groupId: string, data: unknown): FirestoreGroup => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  const visibility = record.visibility;
  const parsedVisibility: FirestoreGroup['visibility'] =
    visibility === 'public' || visibility === 'private' ? visibility : undefined;

  const memberCount = normalizeCount(record.memberCount);

  const description = normalizeNullableString(record.description);
  const categoryId = normalizeNullableString(record.categoryId);
  const iconUrl = normalizeNullableString(record.iconUrl);
  const apiQuery = typeof record.apiQuery === 'string' ? record.apiQuery : undefined;

  return {
    id: groupId,
    name: typeof record.name === 'string' ? record.name : '',
    ...(description !== undefined ? { description } : null),
    ...(categoryId !== undefined ? { categoryId } : null),
    ...(parsedVisibility ? { visibility: parsedVisibility } : null),
    ...(typeof record.ownerId === 'string' ? { ownerId: record.ownerId } : null),
    ...(iconUrl !== undefined ? { iconUrl } : null),
    ...(memberCount !== undefined ? { memberCount } : null),
    ...(apiQuery ? { apiQuery } : null),
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  } as FirestoreGroup;
};

const normalizeTimestamp = (value: unknown): Timestamp | undefined => {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return undefined;
};

const buildGroupMemberRead = (uid: string, groupId: string, data: unknown): GroupMemberRead => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  const role = record.role;
  const parsedRole: GroupMemberRead['role'] =
    role === 'admin' || role === 'moderator' || role === 'member' ? role : 'member';

  return {
    uid,
    groupId: typeof record.groupId === 'string' ? record.groupId : groupId,
    role: parsedRole,
    joinedAt: normalizeTimestamp(record.joinedAt) ?? Timestamp.now(),
  };
};

export const getGroupsPage = async (
  pageSize: number = DEFAULT_PAGE_SIZE,
  cursor?: DocumentSnapshot | null,
): Promise<PaginatedResult<FirestoreGroup>> => {
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(collection(db, 'groups'), orderBy('memberCount', 'desc'), limit(safeLimit + 1));
  if (cursor) q = query(q, startAfter(cursor));

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'groups.getGroupsPage' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupsPage' } },
    );

    trackFirestoreRead('groups.getGroupsPage', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    return {
      items: docs.map((docSnap) => buildFirestoreGroup(docSnap.id, docSnap.data())),
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getGroupsPage' } });
  }
};

export const getGroups = async (
  limitCount: number = DEFAULT_PAGE_SIZE,
): Promise<FirestoreGroup[]> => {
  const result = await getGroupsPage(limitCount);
  return result.items;
};

export const getGroupsByCategoryPage = async (
  categoryId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  cursor?: DocumentSnapshot | null,
): Promise<PaginatedResult<FirestoreGroup>> => {
  const category = validate(idSchema, categoryId, { context: { categoryId } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(
    collection(db, 'groups'),
    where('categoryId', '==', category),
    limit(safeLimit + 1),
  );
  if (cursor) q = query(q, startAfter(cursor));

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'groups.getGroupsByCategoryPage' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupsByCategoryPage', categoryId: category } },
    );

    trackFirestoreRead('groups.getGroupsByCategoryPage', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    return {
      items: docs.map((docSnap) => buildFirestoreGroup(docSnap.id, docSnap.data())),
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.getGroupsByCategoryPage', categoryId: category },
    });
  }
};

export const getGroupsByCategory = async (
  categoryId: string,
  limitCount: number = DEFAULT_PAGE_SIZE,
): Promise<FirestoreGroup[]> => {
  const result = await getGroupsByCategoryPage(categoryId, limitCount);
  return result.items;
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
  const id = validate(idSchema, groupId, { context: { groupId } });

  try {
    const docSnap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'groups', id)), { context: { op: 'groups.getGroup' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroup', groupId: id } },
    );

    trackFirestoreRead('groups.getGroup');

    if (!docSnap.exists()) return null;
    return buildFirestoreGroup(docSnap.id, docSnap.data());
  } catch (error) {
    const appError = toAppError(error, { context: { op: 'groups.getGroup', groupId: id } });
    if (appError.code === 'NOT_FOUND') return null;
    throw appError;
  }
};

export async function getGroupJoinStatus(groupId: string, uid: string): Promise<GroupJoinStatus> {
  const group = validate(idSchema, groupId, { context: { groupId } });
  const userId = validate(idSchema, uid, { context: { uid } });

  try {
    const memberSnap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'groups', group, 'members', userId)), {
        context: { op: 'groups.getGroupJoinStatus.member' },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupJoinStatus.member', groupId: group, uid: userId } },
    );

    trackFirestoreRead('groups.getGroupJoinStatus.member');

    if (memberSnap.exists()) return 'member';

    const reqQuery = query(
      collection(db, 'group_requests'),
      where('groupId', '==', group),
      where('fromUid', '==', userId),
      where('status', '==', 'pending'),
      limit(1),
    );

    const reqSnap = await withTimeout(
      withRetry(() => getDocs(reqQuery), { context: { op: 'groups.getGroupJoinStatus.requests' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupJoinStatus.requests', groupId: group, uid: userId } },
    );

    trackFirestoreRead('groups.getGroupJoinStatus.requests', reqSnap.size);

    return reqSnap.empty ? 'none' : 'pending';
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.getGroupJoinStatus', groupId: group, uid: userId },
    });
  }
}

export const getGroupMemberCount = async (groupId: string): Promise<number> => {
  const id = validate(idSchema, groupId, { context: { groupId } });

  try {
    const snap = await withTimeout(
      withRetry(() => getCountFromServer(collection(db, 'groups', id, 'members')), {
        context: { op: 'groups.getGroupMemberCount' },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupMemberCount', groupId: id } },
    );

    trackFirestoreRead('groups.getGroupMemberCount');

    return snap.data().count;
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getGroupMemberCount', groupId: id } });
  }
};

export const getGroupMembers = async (
  groupId: string,
  limitCount: number = DEFAULT_PAGE_SIZE,
): Promise<GroupMemberRead[]> => {
  const id = validate(idSchema, groupId, { context: { groupId } });
  const safeLimit = validate(safeLimitSchema, limitCount, { context: { limitCount } });

  const q = query(
    collection(db, 'groups', id, 'members'),
    orderBy('joinedAt', 'desc'),
    limit(safeLimit),
  );

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'groups.getGroupMembers' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupMembers', groupId: id } },
    );

    trackFirestoreRead('groups.getGroupMembers', snapshot.size);

    return snapshot.docs.map((docSnap) => buildGroupMemberRead(docSnap.id, id, docSnap.data()));
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getGroupMembers', groupId: id } });
  }
};

export const getGroupMembersPage = async (
  groupId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  lastDoc?: DocumentSnapshot | null,
): Promise<PaginatedResult<GroupMemberRead>> => {
  const id = validate(idSchema, groupId, { context: { groupId } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(
    collection(db, 'groups', id, 'members'),
    orderBy('joinedAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'groups.getGroupMembersPage' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupMembersPage', groupId: id } },
    );

    trackFirestoreRead('groups.getGroupMembersPage', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    const items = docs.map((docSnap) => buildGroupMemberRead(docSnap.id, id, docSnap.data()));

    return {
      items,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getGroupMembersPage', groupId: id } });
  }
};

export const getGroupPostsWeekCount = async (groupId: string): Promise<number> => {
  const id = validate(idSchema, groupId, { context: { groupId } });

  const weekAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, 'posts'),
    where('groupId', '==', id),
    where('createdAt', '>=', weekAgo),
  );

  try {
    const snap = await withTimeout(
      withRetry(() => getCountFromServer(q), { context: { op: 'groups.getGroupPostsWeekCount' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getGroupPostsWeekCount', groupId: id } },
    );

    trackFirestoreRead('groups.getGroupPostsWeekCount');

    return snap.data().count;
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getGroupPostsWeekCount', groupId: id } });
  }
};

export const getPostsByGroup = async (
  groupId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  lastDoc?: DocumentSnapshot | null,
): Promise<PaginatedResult<PostRead>> => {
  const id = validate(idSchema, groupId, { context: { groupId } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let q = query(
    collection(db, 'posts'),
    where('groupId', '==', id),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(q), { context: { op: 'groups.getPostsByGroup' } }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.getPostsByGroup', groupId: id } },
    );

    trackFirestoreRead('groups.getPostsByGroup', snapshot.size);

    const hasMore = snapshot.docs.length > safeLimit;
    const docs = hasMore ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;

    return {
      items: docs.map(
        (docSnap) =>
          ({
            id: docSnap.id,
            ...docSnap.data(),
          }) as PostRead,
      ),
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.getPostsByGroup', groupId: id } });
  }
};
