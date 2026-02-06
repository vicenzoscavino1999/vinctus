import {
  collection,
  deleteDoc as _deleteDoc,
  doc,
  getCountFromServer as _getCountFromServer,
  getDoc as _getDoc,
  getDocs as _getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  startAfter,
  Timestamp,
  updateDoc as _updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;

type GroupVisibility = 'public' | 'private';
type GroupRole = 'member' | 'moderator' | 'admin';
type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';
type GroupJoinStatus = 'member' | 'pending' | 'none';

interface FirestoreGroup {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  visibility?: GroupVisibility;
  ownerId?: string;
  iconUrl?: string | null;
  memberCount?: number;
  apiQuery?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface GroupMemberWrite {
  uid: string;
  groupId: string;
  role: GroupRole;
  joinedAt: FieldValue;
}

interface UserMembershipWrite {
  groupId: string;
  joinedAt: FieldValue;
}

interface CreateGroupInput {
  name: string;
  description: string;
  categoryId: string | null;
  visibility: GroupVisibility;
  iconUrl: string | null;
}

interface GroupJoinRequestRead {
  id: string;
  groupId: string;
  groupName: string;
  fromUid: string;
  toUid: string;
  status: GroupJoinRequestStatus;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GroupMemberRead {
  uid: string;
  groupId: string;
  role: GroupRole;
  joinedAt: Timestamp;
}

interface PaginatedResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

const groupsCollection = collection(db, 'groups');

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

const getCountFromServer = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getCountFromServer');
  return (_getCountFromServer as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getCountFromServer;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const deleteDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.deleteDoc');
  return (_deleteDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _deleteDoc;

export const getGroups = async (): Promise<FirestoreGroup[]> => {
  const snapshot = await getDocs(groupsCollection);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as FirestoreGroup;
  });
};

export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
  const q = query(groupsCollection, where('categoryId', '==', categoryId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as FirestoreGroup;
  });
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
  const docSnap = await getDoc(doc(db, 'groups', groupId));
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as FirestoreGroup;
};

export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const membershipRef = doc(db, 'users', uid, 'memberships', groupId);
  const batch = writeBatch(db);

  batch.set(
    memberRef,
    {
      uid,
      groupId,
      role: 'member',
      joinedAt: serverTimestamp(),
    } as GroupMemberWrite,
    { merge: false },
  );

  batch.set(
    membershipRef,
    {
      groupId,
      joinedAt: serverTimestamp(),
    } as UserMembershipWrite,
    { merge: false },
  );

  await batch.commit();
};

export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const membershipRef = doc(db, 'users', uid, 'memberships', groupId);
  const batch = writeBatch(db);
  batch.delete(memberRef);
  batch.delete(membershipRef);
  await batch.commit();
};

export const isGroupMember = async (groupId: string, uid: string): Promise<boolean> => {
  const docSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  return docSnap.exists();
};

export async function createGroup(ownerId: string, input: CreateGroupInput): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));
  const memberRef = doc(db, 'groups', groupRef.id, 'members', ownerId);
  const membershipRef = doc(db, 'users', ownerId, 'memberships', groupRef.id);
  await setDoc(groupRef, {
    name: input.name,
    description: input.description,
    categoryId: input.categoryId,
    visibility: input.visibility,
    ownerId,
    iconUrl: input.iconUrl,
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    const batch = writeBatch(db);
    batch.set(
      memberRef,
      {
        uid: ownerId,
        groupId: groupRef.id,
        role: 'admin',
        joinedAt: serverTimestamp(),
      } as GroupMemberWrite,
      { merge: false },
    );
    batch.set(
      membershipRef,
      {
        groupId: groupRef.id,
        joinedAt: serverTimestamp(),
      } as UserMembershipWrite,
      { merge: false },
    );
    await batch.commit();
  } catch (error) {
    await deleteDoc(groupRef).catch(() => {});
    throw error;
  }

  return groupRef.id;
}

export async function updateGroup(groupId: string, input: CreateGroupInput): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    name: input.name,
    description: input.description,
    categoryId: input.categoryId,
    visibility: input.visibility,
    iconUrl: input.iconUrl,
    updatedAt: serverTimestamp(),
  });
}

export async function addGroupMember(
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin' = 'member',
): Promise<void> {
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const membershipRef = doc(db, 'users', uid, 'memberships', groupId);
  const groupRef = doc(db, 'groups', groupId);
  const [memberSnap, membershipSnap] = await Promise.all([
    getDoc(memberRef),
    getDoc(membershipRef),
  ]);
  const batch = writeBatch(db);

  if (!memberSnap.exists()) {
    batch.set(
      memberRef,
      {
        uid,
        groupId,
        role,
        joinedAt: serverTimestamp(),
      } as GroupMemberWrite,
      { merge: false },
    );
  }

  if (!membershipSnap.exists()) {
    batch.set(
      membershipRef,
      {
        groupId,
        joinedAt: serverTimestamp(),
      } as UserMembershipWrite,
      { merge: false },
    );
  }

  if (!memberSnap.exists()) {
    batch.update(groupRef, {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function updateGroupMemberRole(
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin',
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), {
    role,
  });
}

export async function removeGroupMember(groupId: string, uid: string): Promise<void> {
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const membershipRef = doc(db, 'users', uid, 'memberships', groupId);
  const batch = writeBatch(db);
  batch.delete(memberRef);
  batch.delete(membershipRef);
  await batch.commit();
}

export async function joinPublicGroup(groupId: string, uid: string): Promise<void> {
  const group = await getGroup(groupId);
  if (!group) {
    throw new Error('Grupo no encontrado');
  }
  const visibility = (group.visibility ?? 'public') as GroupVisibility;
  if (visibility !== 'public') {
    throw new Error('Este grupo es privado');
  }
  await joinGroupWithSync(groupId, uid);
}

export async function sendGroupJoinRequest(input: {
  groupId: string;
  groupName: string;
  fromUid: string;
  toUid: string;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string> {
  const existingQuery = query(
    collection(db, 'group_requests'),
    where('fromUid', '==', input.fromUid),
    where('groupId', '==', input.groupId),
    limit(1),
  );
  const existing = await getDocs(existingQuery);

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    const data = existingDoc.data();
    if (data.status === 'pending') {
      throw new Error('Ya enviaste una solicitud para este grupo.');
    }
    if (data.status === 'accepted') {
      throw new Error('Ya eres miembro de este grupo.');
    }
  }

  const requestRef = doc(collection(db, 'group_requests'));
  await setDoc(requestRef, {
    groupId: input.groupId,
    groupName: input.groupName,
    fromUid: input.fromUid,
    toUid: input.toUid,
    status: 'pending',
    message: input.message,
    fromUserName: input.fromUserName,
    fromUserPhoto: input.fromUserPhoto,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return requestRef.id;
}

export async function getPendingGroupJoinRequests(
  ownerId: string,
  limitCount: number = SMALL_LIST_LIMIT,
): Promise<GroupJoinRequestRead[]> {
  const q = query(
    collection(db, 'group_requests'),
    where('toUid', '==', ownerId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      groupId: data.groupId,
      groupName: data.groupName,
      fromUid: data.fromUid,
      toUid: data.toUid,
      status: (data.status as GroupJoinRequestStatus) || 'pending',
      message: data.message ?? null,
      fromUserName: data.fromUserName ?? null,
      fromUserPhoto: data.fromUserPhoto ?? null,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as GroupJoinRequestRead;
  });
}

export async function acceptGroupJoinRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, 'group_requests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('Solicitud no encontrada');
  }

  const data = requestSnap.data();
  if (data.status !== 'pending') return;

  const groupId = data.groupId as string;
  const memberUid = data.fromUid as string;
  const memberRef = doc(db, 'groups', groupId, 'members', memberUid);
  const membershipRef = doc(db, 'users', memberUid, 'memberships', groupId);
  const batch = writeBatch(db);
  batch.update(requestRef, {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.set(
    memberRef,
    {
      uid: memberUid,
      groupId,
      role: 'member',
      joinedAt: serverTimestamp(),
    } as GroupMemberWrite,
    { merge: false },
  );
  batch.set(
    membershipRef,
    {
      groupId,
      joinedAt: serverTimestamp(),
    } as UserMembershipWrite,
    { merge: false },
  );
  await batch.commit();
}

export async function rejectGroupJoinRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'group_requests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

export async function getGroupJoinStatus(groupId: string, uid: string): Promise<GroupJoinStatus> {
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (memberSnap.exists()) return 'member';

  const reqQuery = query(
    collection(db, 'group_requests'),
    where('groupId', '==', groupId),
    where('fromUid', '==', uid),
    where('status', '==', 'pending'),
    limit(1),
  );
  const reqSnap = await getDocs(reqQuery);
  return reqSnap.empty ? 'none' : 'pending';
}

export async function getGroupMemberCount(groupId: string): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'groups', groupId, 'members'));
  return snap.data().count;
}

export async function getGroupMembers(
  groupId: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<GroupMemberRead[]> {
  const q = query(
    collection(db, 'groups', groupId, 'members'),
    orderBy('joinedAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as {
      groupId?: string;
      role?: GroupMemberRead['role'];
      joinedAt?: Timestamp;
    };
    return {
      uid: docSnap.id,
      groupId: data.groupId ?? groupId,
      role: data.role ?? 'member',
      joinedAt: data.joinedAt ?? Timestamp.now(),
    };
  });
}

export async function getGroupMembersPage(
  groupId: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<GroupMemberRead>> {
  let q = query(
    collection(db, 'groups', groupId, 'members'),
    orderBy('joinedAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data() as {
      groupId?: string;
      role?: GroupMemberRead['role'];
      joinedAt?: Timestamp;
    };
    return {
      uid: docSnap.id,
      groupId: data.groupId ?? groupId,
      role: data.role ?? 'member',
      joinedAt: data.joinedAt ?? Timestamp.now(),
    } as GroupMemberRead;
  });

  const newLastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
  return {
    items,
    lastDoc: newLastDoc,
    hasMore,
  };
}

export async function getGroupPostsWeekCount(groupId: string): Promise<number> {
  const weekAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, 'posts'),
    where('groupId', '==', groupId),
    where('createdAt', '>=', weekAgo),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
