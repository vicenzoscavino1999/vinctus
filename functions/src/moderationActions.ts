import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  NON_USER_REPORT_IDS,
  parseReportedContentTarget,
  parseReportedMessageTarget,
  parseReportedStoryTarget,
} from './moderation';
import {
  COLLECTIONS,
  LIMITS,
  SERVER_COLLECTIONS,
  SUBCOLLECTIONS,
  storagePrefix,
} from './firestoreContract';

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

const fail = (code: functions.https.FunctionsErrorCode, message: string): never => {
  throw new functions.https.HttpsError(code, message);
};

export const REMOVED_MESSAGE_PREVIEW = 'Mensaje eliminado';

/**
 * Conversation lists show `lastMessage.text`, so a removed message must not live on there.
 * Matches by sender and either `clientCreatedAt` (covers media-only messages too) or text.
 */
export async function clearLastMessagePreview(
  db: admin.firestore.Firestore,
  conversationId: string,
  message: Record<string, unknown> | undefined,
): Promise<void> {
  const senderId = message?.senderId;
  if (typeof senderId !== 'string' || !senderId) {
    return;
  }
  const rawText = typeof message?.text === 'string' ? message.text : '';
  const trimmedText = rawText.trim();
  const messageClientCreatedAt =
    typeof message?.clientCreatedAt === 'number' ? message.clientCreatedAt : null;
  const hasAttachments = Array.isArray(message?.attachments) && message.attachments.length > 0;
  if (!trimmedText && !hasAttachments && messageClientCreatedAt === null) {
    return;
  }
  const conversationRef = db.doc(`${COLLECTIONS.conversations}/${conversationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(conversationRef);
    const lastMessage = snap.data()?.lastMessage as Record<string, unknown> | null | undefined;
    if (!lastMessage || lastMessage.senderId !== senderId) {
      return;
    }
    const lastText = typeof lastMessage.text === 'string' ? lastMessage.text : '';
    const lastClientCreatedAt =
      typeof lastMessage.clientCreatedAt === 'number' ? lastMessage.clientCreatedAt : null;
    const matchesClientTimestamp =
      messageClientCreatedAt !== null &&
      lastClientCreatedAt !== null &&
      lastClientCreatedAt === messageClientCreatedAt;
    const matchesText =
      trimmedText.length > 0 && (lastText === rawText || lastText.trim() === trimmedText);
    if (!matchesClientTimestamp && !matchesText) {
      return;
    }
    tx.update(conversationRef, {
      'lastMessage.text': REMOVED_MESSAGE_PREVIEW,
    });
  });
}

/**
 * Deletes Storage attachments and thumbnails belonging to a removed chat message.
 * Only touches paths strictly inside `conversations/{conversationId}/`.
 */
export async function deleteMessageMedia(
  bucket: ReturnType<admin.storage.Storage['bucket']>,
  conversationId: string,
  messageId: string,
  message: Record<string, unknown> | undefined,
): Promise<void> {
  if (!conversationId || conversationId.includes('/') || !messageId || messageId.includes('/')) {
    return;
  }
  const allowedPrefix = `conversations/${conversationId}/`;
  const paths = new Set<string>();
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  for (const attachment of attachments) {
    if (typeof attachment !== 'object' || attachment === null) continue;
    const item = attachment as { path?: unknown; thumbPath?: unknown };
    if (typeof item.path === 'string' && item.path.startsWith(allowedPrefix)) {
      paths.add(item.path);
    }
    if (typeof item.thumbPath === 'string' && item.thumbPath.startsWith(allowedPrefix)) {
      paths.add(item.thumbPath);
    }
  }

  await Promise.all(
    Array.from(paths).map((path) =>
      bucket
        .file(path)
        .delete()
        .catch(() => undefined),
    ),
  );

  const senderId = typeof message?.senderId === 'string' ? message.senderId : '';
  if (senderId && !senderId.includes('/')) {
    const thumbPrefix = `${storagePrefix('conversationThumbnail', {
      conversationId,
      userId: senderId,
    })}${messageId}/`;
    await bucket.deleteFiles({ prefix: thumbPrefix, force: true }).catch(() => undefined);
  }
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
    const adminDoc = await db.doc(`${COLLECTIONS.appAdmins}/${adminUid}`).get();
    if (!adminDoc.exists) {
      return fail('permission-denied', 'Solo administradores de moderacion.');
    }

    const itemId = typeof data?.itemId === 'string' ? data.itemId.trim() : '';
    const action = data?.action as ModerationEnforcementAction;
    const note =
      typeof data?.note === 'string'
        ? data.note.trim().slice(0, LIMITS.moderation.reviewNoteMaxLength)
        : '';
    if (!itemId || itemId.includes('/')) {
      return fail('invalid-argument', 'Caso de moderacion invalido.');
    }
    if (!ACTIONS.includes(action)) {
      return fail('invalid-argument', 'Accion de moderacion invalida.');
    }

    const itemRef = db.doc(`${COLLECTIONS.moderationQueue}/${itemId}`);
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
      const storyId = content || message ? null : parseReportedStoryTarget(item.conversationId);
      if (content) {
        target = content.commentId
          ? `${COLLECTIONS.posts}/${content.postId}/${SUBCOLLECTIONS.comments}/${content.commentId}`
          : `${COLLECTIONS.posts}/${content.postId}`;
        reviewAction = content.commentId ? 'comment_removed' : 'post_removed';
      } else if (message) {
        target = `${COLLECTIONS.conversations}/${message.conversationId}/${SUBCOLLECTIONS.messages}/${message.messageId}`;
        reviewAction = 'message_removed';
      } else if (storyId) {
        target = `${COLLECTIONS.stories}/${storyId}`;
        reviewAction = 'story_removed';
        const story = (await db.doc(target).get()).data();
        const mediaPaths = [story?.mediaPath, story?.thumbPath].filter(
          (path): path is string => typeof path === 'string' && path.length > 0,
        );
        // The files go too; a missing file must not stop the removal.
        await Promise.all(
          mediaPaths.map((path) =>
            admin
              .storage()
              .bucket()
              .file(path)
              .delete()
              .catch(() => undefined),
          ),
        );
      } else {
        return fail(
          'failed-precondition',
          'Este caso no apunta a una publicacion, un comentario, un mensaje o una historia.',
        );
      }
      const messageData = message ? (await db.doc(target).get()).data() : undefined;
      if (message && messageData) {
        await deleteMessageMedia(
          admin.storage().bucket(),
          message.conversationId,
          message.messageId,
          messageData,
        );
      }
      // Deleting a document that is already gone is a no-op, so repeating the action is safe.
      await db.doc(target).delete();
      if (message) {
        await clearLastMessagePreview(db, message.conversationId, messageData);
      }
    } else {
      const reportedUid = typeof item.reportedUid === 'string' ? item.reportedUid : '';
      if (!reportedUid || NON_USER_REPORT_IDS.has(reportedUid) || reportedUid === adminUid) {
        return fail('failed-precondition', 'Este caso no tiene un usuario que se pueda suspender.');
      }
      if (action === 'suspend_user') {
        const reportedIsAdmin = await db.doc(`${COLLECTIONS.appAdmins}/${reportedUid}`).get();
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
      target = `${COLLECTIONS.users}/${reportedUid}`;
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

    await db.collection(SERVER_COLLECTIONS.moderationActions).add({
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
