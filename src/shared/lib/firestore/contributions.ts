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
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export type ContributionType = 'project' | 'paper' | 'cv' | 'certificate' | 'other';

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

export async function getUserContributions(uid: string): Promise<ContributionRead[]> {
  const q = query(collection(db, 'contributions'), where('userId', '==', uid));
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
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
  trackFirestoreRead('firestore.getDocs', snapshot.size);
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
  trackFirestoreWrite('firestore.setDoc');
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
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'contributions', contributionId), {
    fileUrl: input.fileUrl,
    filePath: input.filePath,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    updatedAt: serverTimestamp(),
  });
}
