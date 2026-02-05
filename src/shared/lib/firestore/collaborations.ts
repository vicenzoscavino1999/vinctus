import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const SMALL_LIST_LIMIT = 50;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export type CollaborationStatus = 'open' | 'closed';
export type CollaborationMode = 'virtual' | 'presencial';
export type CollaborationLevel = 'principiante' | 'intermedio' | 'experto';

export type CollaborationAuthorSnapshot = {
  displayName: string;
  photoURL: string | null;
};

export interface CollaborationRead {
  id: string;
  title: string;
  context: string;
  seekingRole: string;
  mode: CollaborationMode;
  location: string | null;
  level: CollaborationLevel;
  topic: string | null;
  tags: string[];
  authorId: string;
  authorSnapshot: CollaborationAuthorSnapshot;
  status: CollaborationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const mapCollaborationDoc = (docSnap: DocumentSnapshot): CollaborationRead => {
  const data = docSnap.data() as Record<string, unknown> | undefined;
  const authorSnapshotData = (data?.authorSnapshot ?? {}) as Record<string, unknown>;
  const createdAt = toDate(data?.createdAt) || new Date();
  const updatedAt = toDate(data?.updatedAt) || createdAt;
  const tags = Array.isArray(data?.tags) ? data?.tags.filter((tag) => typeof tag === 'string') : [];
  const status = data?.status === 'closed' ? 'closed' : 'open';
  const mode = data?.mode === 'presencial' ? 'presencial' : 'virtual';
  const level =
    data?.level === 'experto'
      ? 'experto'
      : data?.level === 'intermedio'
        ? 'intermedio'
        : 'principiante';

  return {
    id: docSnap.id,
    title: typeof data?.title === 'string' ? data.title : '',
    context: typeof data?.context === 'string' ? data.context : '',
    seekingRole: typeof data?.seekingRole === 'string' ? data.seekingRole : '',
    mode,
    location: typeof data?.location === 'string' ? data.location : null,
    level,
    topic: typeof data?.topic === 'string' ? data.topic : null,
    tags: tags as string[],
    authorId: typeof data?.authorId === 'string' ? data.authorId : '',
    authorSnapshot: {
      displayName:
        typeof authorSnapshotData.displayName === 'string'
          ? authorSnapshotData.displayName
          : 'Usuario',
      photoURL:
        typeof authorSnapshotData.photoURL === 'string' ? authorSnapshotData.photoURL : null,
    },
    status,
    createdAt,
    updatedAt,
  };
};

export async function getCollaborations(limitCount = 20): Promise<CollaborationRead[]> {
  const q = query(
    collection(db, 'collaborations'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map(mapCollaborationDoc).filter((item) => item.status === 'open');
}

export interface CreateCollaborationInput {
  title: string;
  context: string;
  seekingRole: string;
  mode: CollaborationMode;
  location: string | null;
  level: CollaborationLevel;
  topic: string | null;
  tags: string[];
}

export async function createCollaboration(
  authorId: string,
  authorSnapshot: CollaborationAuthorSnapshot,
  input: CreateCollaborationInput,
): Promise<string> {
  const collaborationRef = doc(collection(db, 'collaborations'));
  trackFirestoreWrite('firestore.setDoc');
  await setDoc(collaborationRef, {
    title: input.title,
    context: input.context,
    seekingRole: input.seekingRole,
    mode: input.mode,
    location: input.location,
    level: input.level,
    topic: input.topic,
    tags: input.tags,
    authorId,
    authorSnapshot,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return collaborationRef.id;
}

export async function updateCollaboration(
  collaborationId: string,
  input: CreateCollaborationInput,
): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'collaborations', collaborationId), {
    title: input.title,
    context: input.context,
    seekingRole: input.seekingRole,
    mode: input.mode,
    location: input.location,
    level: input.level,
    topic: input.topic,
    tags: input.tags,
    updatedAt: serverTimestamp(),
  });
}

export type CollaborationRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface CollaborationRequestRead {
  id: string;
  collaborationId: string;
  collaborationTitle: string;
  fromUid: string;
  toUid: string;
  status: CollaborationRequestStatus;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function sendCollaborationRequest(input: {
  collaborationId: string;
  collaborationTitle: string;
  fromUid: string;
  toUid: string;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string> {
  const existingQuery = query(
    collection(db, 'collaboration_requests'),
    where('fromUid', '==', input.fromUid),
    where('collaborationId', '==', input.collaborationId),
    limit(1),
  );
  const existing = await getDocs(existingQuery);
  trackFirestoreRead('firestore.getDocs', existing.size);

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    const data = existingDoc.data();
    if (data.status === 'pending') {
      throw new Error('Ya enviaste una solicitud para este proyecto.');
    }
    if (data.status === 'accepted') {
      throw new Error('Esta solicitud ya fue aceptada.');
    }
  }

  const requestRef = doc(collection(db, 'collaboration_requests'));
  trackFirestoreWrite('firestore.setDoc');
  await setDoc(requestRef, {
    collaborationId: input.collaborationId,
    collaborationTitle: input.collaborationTitle,
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

export async function deleteCollaboration(
  authorId: string,
  collaborationId: string,
): Promise<void> {
  const pendingQuery = query(
    collection(db, 'collaboration_requests'),
    where('collaborationId', '==', collaborationId),
    where('toUid', '==', authorId),
    where('status', '==', 'pending'),
  );
  const pendingSnapshot = await getDocs(pendingQuery);
  trackFirestoreRead('firestore.getDocs', pendingSnapshot.size);

  const batch = writeBatch(db);
  pendingSnapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  });

  batch.delete(doc(db, 'collaborations', collaborationId));
  await batch.commit();
}

export async function getPendingCollaborationRequests(
  uid: string,
  limitCount: number = SMALL_LIST_LIMIT,
): Promise<CollaborationRequestRead[]> {
  const q = query(
    collection(db, 'collaboration_requests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);

  const items = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = toDate(data.createdAt) || new Date();
    const updatedAt = toDate(data.updatedAt) || createdAt;

    return {
      id: docSnap.id,
      collaborationId: data.collaborationId || '',
      collaborationTitle: data.collaborationTitle || '',
      fromUid: data.fromUid || '',
      toUid: data.toUid || '',
      status: (data.status as CollaborationRequestStatus) || 'pending',
      message: data.message || null,
      fromUserName: data.fromUserName || null,
      fromUserPhoto: data.fromUserPhoto || null,
      createdAt,
      updatedAt,
    } as CollaborationRequestRead;
  });

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function acceptCollaborationRequest(requestId: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'collaboration_requests', requestId), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
}

export async function rejectCollaborationRequest(requestId: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'collaboration_requests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}
