import { collection, doc, serverTimestamp, setDoc, type FieldValue } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';

export type UserReportReason = 'spam' | 'harassment' | 'abuse' | 'fake' | 'other';

export interface UserReportWrite {
  reporterUid: string;
  reportedUid: string;
  reason: UserReportReason;
  details: string | null;
  conversationId: string | null;
  status: 'open';
  createdAt: FieldValue;
}

export async function createUserReport(input: {
  reporterUid: string;
  reportedUid: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> {
  const reportRef = doc(collection(db, 'reports'));
  await setDoc(
    reportRef,
    {
      reporterUid: input.reporterUid,
      reportedUid: input.reportedUid,
      reason: input.reason,
      details: input.details ?? null,
      conversationId: input.conversationId ?? null,
      status: 'open',
      createdAt: serverTimestamp(),
    } as UserReportWrite,
    { merge: false },
  );
  return reportRef.id;
}

export async function createGroupReport(input: {
  reporterUid: string;
  groupId: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> {
  const details = input.details?.trim();
  const mergedDetails = details
    ? `[Grupo ${input.groupId}] ${details}`
    : `Reporte de grupo ${input.groupId}`;

  return createUserReport({
    reporterUid: input.reporterUid,
    reportedUid: input.groupId,
    reason: input.reason,
    details: mergedDetails,
    conversationId: input.conversationId ?? `grp_${input.groupId}`,
  });
}
