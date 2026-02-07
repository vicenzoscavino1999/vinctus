import {
  collection,
  doc,
  getDocs as _getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  Timestamp,
  updateDoc as _updateDoc,
  where,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

export type ContributionType = 'project' | 'paper' | 'cv' | 'certificate' | 'other';
const SMALL_LIST_LIMIT = 50;

export interface ContributionRead {
  id: string;
  userId: string;
  type: ContributionType;
  title: string;
  description: string | null;
  categoryId?: string | null;
  link: string | null;
  fileUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContributionWrite {
  userId: string;
  type: ContributionType;
  title: string;
  description: string | null;
  categoryId?: string | null;
  link: string | null;
  fileUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

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

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export async function getUserContributions(uid: string): Promise<ContributionRead[]> {
  const q = query(
    collection(db, 'contributions'),
    where('userId', '==', uid),
    limit(SMALL_LIST_LIMIT),
  );
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      userId: data.userId,
      type: data.type as ContributionType,
      title: data.title,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      link: data.link ?? null,
      fileUrl: data.fileUrl ?? null,
      filePath: data.filePath ?? null,
      fileName: data.fileName ?? null,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
      fileType: data.fileType ?? null,
      createdAt: toDate(data.createdAt) ?? new Date(0),
      updatedAt: toDate(data.updatedAt) ?? new Date(0),
    } as ContributionRead;
  });
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}

export async function getContributionsByCategory(
  categoryId: string,
  limitCount: number = 12,
): Promise<ContributionRead[]> {
  const q = query(
    collection(db, 'contributions'),
    where('categoryId', '==', categoryId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      userId: data.userId,
      type: data.type as ContributionType,
      title: data.title,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      link: data.link ?? null,
      fileUrl: data.fileUrl ?? null,
      filePath: data.filePath ?? null,
      fileName: data.fileName ?? null,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
      fileType: data.fileType ?? null,
      createdAt: toDate(data.createdAt) ?? new Date(0),
      updatedAt: toDate(data.updatedAt) ?? new Date(0),
    } as ContributionRead;
  });
}

export async function createContribution(input: {
  userId: string;
  type: ContributionType;
  title: string;
  description?: string | null;
  link?: string | null;
  categoryId?: string | null;
}): Promise<string> {
  const ref = doc(collection(db, 'contributions'));
  await setDoc(
    ref,
    {
      userId: input.userId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      link: input.link ?? null,
      fileUrl: null,
      filePath: null,
      fileName: null,
      fileSize: null,
      fileType: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as ContributionWrite,
    { merge: false },
  );
  return ref.id;
}

export async function updateContributionFile(
  contributionId: string,
  input: {
    fileUrl: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  },
): Promise<void> {
  await updateDoc(doc(db, 'contributions', contributionId), {
    fileUrl: input.fileUrl,
    filePath: input.filePath,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    updatedAt: serverTimestamp(),
  });
}
