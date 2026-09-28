import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { parseReportedContentTarget, parseReportedMessageTarget } from './moderation';

export type ModerationEnforcementAction = 'remove_content' | 'suspend_user' | 'restore_user';

export interface ModerationTakeActionResponse {
  status: string;
  reviewAction: string;
}

const ACTIONS: readonly ModerationEnforcementAction[] = [
  'remove_content',
  'suspend_user',
  'restore_user',
];

// reportedUid values that are not real accounts: auto-moderation (upsertAutoModerationReport in
// index.ts) and reports on AI replies from the iOS app (ReportTarget.aiReportedUID).
const NON_USER_IDS = new Set(['system_moderation', 'unknown_user', 'ai_assistant']);

const fail = (code: functions.https.FunctionsErrorCode, message: string): never => {
  throw new functions.https.HttpsError(code, message);
};

export const REMOVED_MESSAGE_PREVIEW = 'Mensaje eliminado';

/**
 * Conversation lists show `lastMessage.text`, so a removed message must not live on there.
 * `lastMessage` carries no message id, so it is matched by sender and text.
 */
export async function clearLastMessagePreview(
  db: admin.firestore.Firestore,
  conversationId: string,
  message: Record<string, unknown> | undefined,
): Promise<void> {
  const senderId = message?.senderId;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (typeof senderId !== 'string' || !text) {
    return;
  }
  const conversationRef = db.doc(`conversations/${conversationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(conversationRef);
    const lastMessage = snap.data()?.lastMessage as Record<string, unknown> | null | undefined;
    if (!lastMessage || lastMessage.senderId !== senderId || lastMessage.text !== text) {
      return;
    }
    tx.update(conversationRef, {
      'lastMessage.text': REMOVED_MESSAGE_PREVIEW,
    });
  });
}

/**
 * Lets Trust & Safety admins act on a moderation queue item: remove the reported post or
 * comment, or suspend (and later restore) the reported user. Every action is logged in
 * `moderation_actions` and recorded on the queue item.
 */
export const moderationTakeAction = functions.https.onCall(
  async (data, context): Promise<ModerationTakeActionResponse> => {
    if (!context.auth) {
      return fail('unauthenticated', 'Debes iniciar sesion.');
    }

    const db = admin.firestore();
    const adminUid = context.auth.uid;
    const adminDoc = await db.doc(`app_admins/${adminUid}`).get();
    if (!adminDoc.exists) {
      return fail('permission-denied', 'Solo administradores de moderacion.');
    }

    const itemId = typeof data?.itemId === 'string' ? data.itemId.trim() : '';
    const action = data?.action as ModerationEnforcementAction;
    const note = typeof data?.note === 'string' ? data.note.trim().slice(0, 2000) : '';
    if (!itemId || itemId.includes('/')) {
      return fail('invalid-argument', 'Caso de moderacion invalido.');
    }
    if (!ACTIONS.includes(action)) {
      return fail('invalid-argument', 'Accion de moderacion invalida.');
    }

    const itemRef = db.doc(`moderation_queue/${itemId}`);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      return fail('not-found', 'El caso de moderacion no existe.');
    }
    const item = itemSnap.data() || {};

    let reviewAction: string;
    let target: string;

    if (action === 'remove_content') {
      const content = parseReportedContentTarget(item.conversationId);
      const message = content ? null : parseReportedMessageTarget(item.conversationId);
      if (content) {
        target = content.commentId
          ? `posts/${content.postId}/comments/${content.commentId}`
          : `posts/${content.postId}`;
        reviewAction = content.commentId ? 'comment_removed' : 'post_removed';
      } else if (message) {
        target = `conversations/${message.conversationId}/messages/${message.messageId}`;
        reviewAction = 'message_removed';
      } else {
        return fail(
          'failed-precondition',
          'Este caso no apunta a una publicacion, un comentario o un mensaje.',
        );
      }
      const messageData = message ? (await db.doc(target).get()).data() : undefined;
      // Deleting a document that is already gone is a no-op, so repeating the action is safe.
      await db.doc(target).delete();
      if (message) {
        await clearLastMessagePreview(db, message.conversationId, messageData);
      }
    } else {
      const reportedUid = typeof item.reportedUid === 'string' ? item.reportedUid : '';
      if (!reportedUid || NON_USER_IDS.has(reportedUid) || reportedUid === adminUid) {
        return fail('failed-precondition', 'Este caso no tiene un usuario que se pueda suspender.');
      }
      if (action === 'suspend_user') {
        const reportedIsAdmin = await db.doc(`app_admins/${reportedUid}`).get();
        if (reportedIsAdmin.exists) {
          return fail('failed-precondition', 'No se puede suspender a un administrador.');
        }
      }

      try {
        await admin.auth().updateUser(reportedUid, { disabled: action === 'suspend_user' });
      } catch (error) {
        if ((error as { code?: string })?.code === 'auth/user-not-found') {
          return fail('not-found', 'La cuenta reportada no existe.');
        }
        throw error;
      }
      if (action === 'suspend_user') {
        // Signs the user out everywhere; a disabled account can't sign back in.
        await admin.auth().revokeRefreshTokens(reportedUid);
      }
      target = `users/${reportedUid}`;
      reviewAction = action === 'suspend_user' ? 'user_suspended' : 'user_restored';
    }

    const status =
      action === 'restore_user' && typeof item.status === 'string' ? item.status : 'resolved';

    await itemRef.update({
      status,
      reviewAction,
      reviewNote: note || null,
      reviewedBy: adminUid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('moderation_actions').add({
      itemId,
      reportId: typeof item.reportId === 'string' ? item.reportId : itemId,
      action,
      reviewAction,
      target,
      note: note || null,
      actedBy: adminUid,
      actedAt: FieldValue.serverTimestamp(),
    });

    functions.logger.info('Moderation action applied', { itemId, action, target });
    return { status, reviewAction };
  },
);
