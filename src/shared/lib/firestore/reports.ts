import { collection, doc, serverTimestamp, setDoc, type FieldValue } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { COLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

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
  const reportRef = doc(collection(db, COLLECTIONS.reports));
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

export async function createPostReport(input: {
  reporterUid: string;
  postId: string;
  postAuthorId?: string | null;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> {
  const details = input.details?.trim();
  const mergedDetails = details
    ? `[Post ${input.postId}] ${details}`
    : `Reporte de publicacion ${input.postId}`;

  return createUserReport({
    reporterUid: input.reporterUid,
    reportedUid: input.postAuthorId?.trim() || input.postId,
    reason: input.reason,
    details: mergedDetails,
    conversationId: `post_${input.postId}`,
  });
}

export async function createPostCommentReport(input: {
  reporterUid: string;
  postId: string;
  commentId: string;
  commentAuthorId?: string | null;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> {
  const details = input.details?.trim();
  const mergedDetails = details
    ? `[Post ${input.postId}][Comment ${input.commentId}] ${details}`
    : `Reporte de comentario ${input.commentId} en post ${input.postId}`;

  return createUserReport({
    reporterUid: input.reporterUid,
    reportedUid: input.commentAuthorId?.trim() || input.commentId,
    reason: input.reason,
    details: mergedDetails,
    conversationId: `post_${input.postId}_comment_${input.commentId}`,
  });
}

export async function createStoryReport(input: {
  reporterUid: string;
  storyId: string;
  storyOwnerId?: string | null;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> {
  const details = input.details?.trim();
  const mergedDetails = details
    ? `[Historia ${input.storyId}] ${details}`
    : `[Historia ${input.storyId}]`;

  return createUserReport({
    reporterUid: input.reporterUid,
    reportedUid: input.storyOwnerId?.trim() || input.storyId,
    reason: input.reason,
    details: mergedDetails,
    conversationId: `story_${input.storyId}`,
  });
}

/** `reportedUid` of AI reports; moderators can remove nothing and suspend no one for them. */
export const AI_REPORTED_UID = 'ai_assistant';

/**
 * A reply of Chat con IA or Arena IA. Built exactly like the native app's `ReportFields`
 * (`.aiResponse`): the excerpt is capped so the whole report fits the rules' 2000 characters.
 * `contextId` is "chat" or `arena_<debateId>`.
 */
export async function createAIResponseReport(input: {
  reporterUid: string;
  contextId: string;
  excerpt: string;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> {
  const excerpt = input.excerpt.slice(0, 900);
  const details = input.details?.trim();
  return createUserReport({
    reporterUid: input.reporterUid,
    reportedUid: AI_REPORTED_UID,
    reason: input.reason,
    details: `[IA ${input.contextId}] ${excerpt}${details ? ` | Motivo: ${details}` : ''}`.slice(
      0,
      2000,
    ),
    conversationId: `ai_${input.contextId}`,
  });
}
