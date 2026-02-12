import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const QUERY_BATCH_SIZE = 200;
const WRITE_BATCH_SIZE = 400;
const DELETION_JOB_COLLECTION = 'deletionJobs';
const YOUTUBE_MEDIA_PATH_TOKEN = '/videos/youtube-';

type DeletionStats = Record<string, number>;
type DeletionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type RequestAccountDeletionResponse = {
  accepted: boolean;
  status: DeletionJobStatus;
  jobId: string;
};

type GetAccountDeletionStatusResponse = {
  status: DeletionJobStatus | 'not_requested';
  jobId: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
};

const incrementStat = (stats: DeletionStats, key: string, delta: number): void => {
  if (delta <= 0) return;
  stats[key] = (stats[key] || 0) + delta;
};

const createDeletionJobRef = (uid: string) => db.doc(`${DELETION_JOB_COLLECTION}/${uid}`);

const parseDeletionJobStatus = (value: unknown): DeletionJobStatus | null => {
  if (value === 'queued' || value === 'processing' || value === 'completed' || value === 'failed') {
    return value;
  }
  return null;
};

const toIsoOrNull = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const isAuthUserNotFoundError = (error: unknown): boolean => {
  const code = (error as { code?: unknown })?.code;
  return code === 'auth/user-not-found' || code === 'user-not-found';
};

async function deleteRefsInBatches(
  refs: readonly admin.firestore.DocumentReference[],
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += WRITE_BATCH_SIZE) {
    const chunk = refs.slice(i, i + WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteTopLevelByField(
  collectionName: string,
  field: string,
  value: string,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, '==', value)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;
    totalDeleted += await deleteRefsInBatches(snapshot.docs.map((docSnap) => docSnap.ref));

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }
  return totalDeleted;
}

async function deleteCollectionGroupByField(
  collectionId: string,
  field: string,
  value: string,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    const snapshot = await db
      .collectionGroup(collectionId)
      .where(field, '==', value)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;
    totalDeleted += await deleteRefsInBatches(snapshot.docs.map((docSnap) => docSnap.ref));

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }
  return totalDeleted;
}

async function deleteStoragePrefix(prefix: string): Promise<void> {
  if (!prefix) return;
  try {
    await bucket.deleteFiles({ prefix, force: true });
  } catch (error) {
    functions.logger.warn('Storage prefix cleanup failed', {
      prefix,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteStorageFiles(paths: readonly string[]): Promise<number> {
  const deduped = Array.from(new Set(paths.filter((path) => typeof path === 'string' && path)));
  if (deduped.length === 0) {
    return 0;
  }

  const settled = await Promise.allSettled(
    deduped.map(async (path) => {
      await bucket.file(path).delete();
    }),
  );

  let deleted = 0;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      deleted += 1;
      return;
    }
    functions.logger.warn('Storage file cleanup failed', {
      path: deduped[index],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  return deleted;
}

async function decrementCommentCounters(decrements: ReadonlyMap<string, number>): Promise<void> {
  for (const [postId, decrementBy] of decrements.entries()) {
    if (!postId || decrementBy <= 0) {
      continue;
    }

    const postRef = db.doc(`posts/${postId}`);
    await db.runTransaction(async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists) return;

      const postData = postSnap.data() || {};
      const currentCommentCount =
        typeof postData.commentCount === 'number'
          ? postData.commentCount
          : typeof postData.commentsCount === 'number'
            ? postData.commentsCount
            : 0;

      const nextCommentCount = Math.max(0, currentCommentCount - decrementBy);

      tx.update(postRef, {
        commentCount: nextCommentCount,
        commentsCount: nextCommentCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
}

async function deleteAuthoredComments(uid: string): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db
      .collectionGroup('comments')
      .where('authorId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const commentRefs: admin.firestore.DocumentReference[] = [];
    const decrements = new Map<string, number>();

    snapshot.docs.forEach((docSnap) => {
      commentRefs.push(docSnap.ref);
      const postId = typeof docSnap.data().postId === 'string' ? docSnap.data().postId : null;
      if (!postId) return;
      decrements.set(postId, (decrements.get(postId) || 0) + 1);
    });

    totalDeleted += await deleteRefsInBatches(commentRefs);
    await decrementCommentCounters(decrements);

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function deleteOwnedContributions(uid: string): Promise<{ docs: number; files: number }> {
  let docsDeleted = 0;
  let filesDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('contributions')
      .where('userId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const filePaths: string[] = [];
    snapshot.docs.forEach((docSnap) => {
      const filePath = docSnap.data().filePath;
      if (typeof filePath === 'string' && filePath.length > 0) {
        filePaths.push(filePath);
      }
    });

    docsDeleted += await deleteRefsInBatches(snapshot.docs.map((docSnap) => docSnap.ref));
    filesDeleted += await deleteStorageFiles(filePaths);

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return { docs: docsDeleted, files: filesDeleted };
}

function isLikelyStoragePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  if (path.startsWith('youtube:')) return false;
  return true;
}

function extractStoryMediaPaths(data: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (isLikelyStoragePath(data.mediaPath)) {
    paths.push(data.mediaPath);
  }
  if (isLikelyStoragePath(data.thumbPath)) {
    paths.push(data.thumbPath);
  }
  return paths;
}

function extractPostMediaPaths(data: Record<string, unknown>): string[] {
  const media = Array.isArray(data.media) ? data.media : [];
  const paths: string[] = [];

  media.forEach((item) => {
    if (typeof item !== 'object' || item === null) return;
    const typedItem = item as { path?: unknown; url?: unknown };
    if (!isLikelyStoragePath(typedItem.path)) return;

    const mediaUrl = typeof typedItem.url === 'string' ? typedItem.url : '';
    const looksLikeExternalYouTube =
      typedItem.path.includes(YOUTUBE_MEDIA_PATH_TOKEN) ||
      mediaUrl.includes('youtube.com/') ||
      mediaUrl.includes('youtu.be/') ||
      mediaUrl.includes('youtube-nocookie.com/');

    if (!looksLikeExternalYouTube) {
      paths.push(typedItem.path);
    }
  });

  return paths;
}

async function deleteOwnedStories(uid: string): Promise<{ docs: number; files: number }> {
  let docsDeleted = 0;
  let filesDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('stories')
      .where('ownerId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const filePaths: string[] = [];
    for (const storyDoc of snapshot.docs) {
      filePaths.push(...extractStoryMediaPaths((storyDoc.data() || {}) as Record<string, unknown>));
      await db.recursiveDelete(storyDoc.ref);
      docsDeleted += 1;
    }

    filesDeleted += await deleteStorageFiles(filePaths);

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return { docs: docsDeleted, files: filesDeleted };
}

async function deleteOwnedPosts(
  uid: string,
): Promise<{ docs: number; files: number; savedRefs: number; likeRefs: number }> {
  let docsDeleted = 0;
  let filesDeleted = 0;
  let savedRefsDeleted = 0;
  let likeRefsDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('posts')
      .where('authorId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const filePaths: string[] = [];
    const postIds: string[] = [];

    for (const postDoc of snapshot.docs) {
      postIds.push(postDoc.id);
      filePaths.push(...extractPostMediaPaths((postDoc.data() || {}) as Record<string, unknown>));
      await db.recursiveDelete(postDoc.ref);
      docsDeleted += 1;
    }

    filesDeleted += await deleteStorageFiles(filePaths);

    for (const postId of postIds) {
      savedRefsDeleted += await deleteCollectionGroupByField('savedPosts', 'postId', postId);
      likeRefsDeleted += await deleteCollectionGroupByField('likes', 'postId', postId);
    }

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return {
    docs: docsDeleted,
    files: filesDeleted,
    savedRefs: savedRefsDeleted,
    likeRefs: likeRefsDeleted,
  };
}

async function deleteOwnedEvents(uid: string): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('events')
      .where('createdBy', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    for (const eventDoc of snapshot.docs) {
      await db.recursiveDelete(eventDoc.ref);
      totalDeleted += 1;
    }

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function deleteOwnedGroups(uid: string): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('groups')
      .where('ownerId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    for (const groupDoc of snapshot.docs) {
      const groupId = groupDoc.id;
      const conversationId = `grp_${groupId}`;

      await deleteStoragePrefix(`groups/${uid}/${groupId}/`);
      await deleteStoragePrefix(`conversations/${conversationId}/`);
      await db.recursiveDelete(db.doc(`conversations/${conversationId}`));
      await db.recursiveDelete(groupDoc.ref);
      totalDeleted += 1;
    }

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function deleteOwnedArenaDebates(uid: string): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db
      .collection('arenaDebates')
      .where('createdBy', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    for (const debateDoc of snapshot.docs) {
      await db.recursiveDelete(debateDoc.ref);
      totalDeleted += 1;
    }

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return totalDeleted;
}

async function deleteDirectConversations(uid: string): Promise<number> {
  const conversationIds = new Set<string>();

  const userDirectIndex = await db
    .collection('users')
    .doc(uid)
    .collection('directConversations')
    .get();
  userDirectIndex.docs.forEach((docSnap) => {
    if (docSnap.id.startsWith('dm_')) {
      conversationIds.add(docSnap.id);
    }
  });

  const directConversationQuery = await db
    .collection('conversations')
    .where('memberIds', 'array-contains', uid)
    .get();
  directConversationQuery.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const isDirect = data.type === 'direct' || docSnap.id.startsWith('dm_');
    if (isDirect) {
      conversationIds.add(docSnap.id);
    }
  });

  let deleted = 0;
  for (const conversationId of conversationIds) {
    await deleteStoragePrefix(`conversations/${conversationId}/`);
    await db.recursiveDelete(db.doc(`conversations/${conversationId}`));
    deleted += 1;
  }

  return deleted;
}

async function deleteMessagesBySender(
  uid: string,
): Promise<{ messages: number; attachments: number }> {
  let messagesDeleted = 0;
  let attachmentsDeleted = 0;

  while (true) {
    const snapshot = await db
      .collectionGroup('messages')
      .where('senderId', '==', uid)
      .limit(QUERY_BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const messageRefs: admin.firestore.DocumentReference[] = [];
    const attachmentPaths: string[] = [];
    const thumbnailPrefixes = new Set<string>();

    snapshot.docs.forEach((docSnap) => {
      messageRefs.push(docSnap.ref);

      const data = docSnap.data() || {};
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];
      attachments.forEach((attachment) => {
        if (typeof attachment !== 'object' || attachment === null) return;
        const path = (attachment as { path?: unknown }).path;
        if (typeof path === 'string' && path.length > 0) {
          attachmentPaths.push(path);
        }
      });

      const pathSegments = docSnap.ref.path.split('/');
      const conversationId = pathSegments[0] === 'conversations' ? pathSegments[1] : null;
      if (conversationId) {
        thumbnailPrefixes.add(`conversations/${conversationId}/thumbnails/${uid}/`);
      }
    });

    messagesDeleted += await deleteRefsInBatches(messageRefs);
    attachmentsDeleted += await deleteStorageFiles(attachmentPaths);

    for (const prefix of thumbnailPrefixes) {
      await deleteStoragePrefix(prefix);
    }

    if (snapshot.size < QUERY_BATCH_SIZE) break;
  }

  return { messages: messagesDeleted, attachments: attachmentsDeleted };
}

async function deleteAuthUserIdempotent(uid: string): Promise<void> {
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (isAuthUserNotFoundError(error)) {
      functions.logger.info('Auth user already removed during account deletion', { uid });
      return;
    }
    throw error;
  }
}

async function executeAccountDeletion(uid: string): Promise<DeletionStats> {
  const stats: DeletionStats = {};
  functions.logger.info('Starting account deletion', { uid });

  // 1) Remove cross-user references first to avoid orphaned relationship docs.
  incrementStat(
    stats,
    'followerDocsDeleted',
    await deleteCollectionGroupByField('followers', 'uid', uid),
  );
  incrementStat(
    stats,
    'followingDocsDeleted',
    await deleteCollectionGroupByField('following', 'uid', uid),
  );
  incrementStat(
    stats,
    'friendDocsDeleted',
    await deleteCollectionGroupByField('friends', 'uid', uid),
  );
  incrementStat(
    stats,
    'blockedByOthersDeleted',
    await deleteCollectionGroupByField('blockedUsers', 'blockedUid', uid),
  );
  incrementStat(
    stats,
    'memberDocsDeleted',
    await deleteCollectionGroupByField('members', 'uid', uid),
  );
  incrementStat(
    stats,
    'attendeeDocsDeleted',
    await deleteCollectionGroupByField('attendees', 'uid', uid),
  );
  incrementStat(stats, 'likeDocsDeleted', await deleteCollectionGroupByField('likes', 'uid', uid));

  // 2) Delete top-level docs tied to uid.
  incrementStat(
    stats,
    'notificationsDeleted',
    (await deleteTopLevelByField('notifications', 'toUid', uid)) +
      (await deleteTopLevelByField('notifications', 'fromUid', uid)),
  );
  incrementStat(
    stats,
    'followRequestsDeleted',
    (await deleteTopLevelByField('follow_requests', 'fromUid', uid)) +
      (await deleteTopLevelByField('follow_requests', 'toUid', uid)),
  );
  incrementStat(
    stats,
    'friendRequestsDeleted',
    (await deleteTopLevelByField('friend_requests', 'fromUid', uid)) +
      (await deleteTopLevelByField('friend_requests', 'toUid', uid)),
  );
  incrementStat(
    stats,
    'groupRequestsDeleted',
    (await deleteTopLevelByField('group_requests', 'fromUid', uid)) +
      (await deleteTopLevelByField('group_requests', 'toUid', uid)),
  );
  incrementStat(
    stats,
    'collaborationRequestsDeleted',
    (await deleteTopLevelByField('collaboration_requests', 'fromUid', uid)) +
      (await deleteTopLevelByField('collaboration_requests', 'toUid', uid)),
  );
  incrementStat(
    stats,
    'reportsDeleted',
    (await deleteTopLevelByField('reports', 'reporterUid', uid)) +
      (await deleteTopLevelByField('reports', 'reportedUid', uid)),
  );
  incrementStat(
    stats,
    'moderationQueueDeleted',
    (await deleteTopLevelByField('moderation_queue', 'reporterUid', uid)) +
      (await deleteTopLevelByField('moderation_queue', 'reportedUid', uid)),
  );
  incrementStat(
    stats,
    'supportTicketsDeleted',
    await deleteTopLevelByField('support_tickets', 'uid', uid),
  );

  // 3) Remove conversations and chat payload.
  incrementStat(stats, 'directConversationsDeleted', await deleteDirectConversations(uid));
  const chatCleanup = await deleteMessagesBySender(uid);
  incrementStat(stats, 'messagesDeleted', chatCleanup.messages);
  incrementStat(stats, 'messageAttachmentsDeleted', chatCleanup.attachments);

  // 4) Delete authored resources.
  const postCleanup = await deleteOwnedPosts(uid);
  incrementStat(stats, 'postsDeleted', postCleanup.docs);
  incrementStat(stats, 'postMediaFilesDeleted', postCleanup.files);
  incrementStat(stats, 'postSavedRefsDeleted', postCleanup.savedRefs);
  incrementStat(stats, 'postLikeRefsDeleted', postCleanup.likeRefs);

  incrementStat(stats, 'commentsDeleted', await deleteAuthoredComments(uid));
  const storyCleanup = await deleteOwnedStories(uid);
  incrementStat(stats, 'storiesDeleted', storyCleanup.docs);
  incrementStat(stats, 'storyFilesDeleted', storyCleanup.files);
  incrementStat(stats, 'eventsDeleted', await deleteOwnedEvents(uid));
  incrementStat(stats, 'groupsDeleted', await deleteOwnedGroups(uid));
  incrementStat(
    stats,
    'collaborationsDeleted',
    await deleteTopLevelByField('collaborations', 'authorId', uid),
  );
  incrementStat(stats, 'arenaDebatesDeleted', await deleteOwnedArenaDebates(uid));

  const contributionCleanup = await deleteOwnedContributions(uid);
  incrementStat(stats, 'contributionsDeleted', contributionCleanup.docs);
  incrementStat(stats, 'contributionFilesDeleted', contributionCleanup.files);

  // 5) Best-effort storage cleanup by user prefixes.
  await deleteStoragePrefix(`profiles/${uid}/`);
  await deleteStoragePrefix(`posts/${uid}/`);
  await deleteStoragePrefix(`stories/${uid}/`);
  await deleteStoragePrefix(`collections/${uid}/`);
  await deleteStoragePrefix(`contributions/${uid}/`);
  await deleteStoragePrefix(`groups/${uid}/`);

  // 6) Remove arena usage and user profile docs (with all subcollections).
  const arenaUsageRef = db.doc(`arenaUsage/${uid}`);
  const arenaUsageSnap = await arenaUsageRef.get();
  if (arenaUsageSnap.exists) {
    await db.recursiveDelete(arenaUsageRef);
    incrementStat(stats, 'arenaUsageDocsDeleted', 1);
  }

  const userRef = db.collection('users').doc(uid);
  await db.recursiveDelete(userRef);

  const publicUserRef = db.collection('users_public').doc(uid);
  await publicUserRef.delete().catch((error) => {
    const code = (error as { code?: string }).code;
    if (code !== 'not-found') {
      throw error;
    }
  });

  // 7) Finally delete Auth user.
  await deleteAuthUserIdempotent(uid);

  functions.logger.info('Account deletion completed', { uid, stats });
  return stats;
}

async function upsertDeletionJobFromCallable(uid: string): Promise<DeletionJobStatus> {
  const jobRef = createDeletionJobRef(uid);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(jobRef);
    const now = FieldValue.serverTimestamp();
    const currentStatus = snapshot.exists ? parseDeletionJobStatus(snapshot.data()?.status) : null;

    if (!snapshot.exists) {
      tx.set(jobRef, {
        uid,
        status: 'queued',
        requestedAt: now,
        updatedAt: now,
        attempts: 0,
        lastError: null,
      });
      return 'queued';
    }

    if (
      currentStatus === 'queued' ||
      currentStatus === 'processing' ||
      currentStatus === 'completed'
    ) {
      tx.set(
        jobRef,
        {
          updatedAt: now,
        },
        { merge: true },
      );
      return currentStatus;
    }

    tx.set(
      jobRef,
      {
        uid,
        status: 'queued',
        requestedAt: now,
        updatedAt: now,
        lastError: null,
      },
      { merge: true },
    );
    return 'queued';
  });
}

async function claimDeletionJob(uid: string): Promise<boolean> {
  const jobRef = createDeletionJobRef(uid);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(jobRef);
    if (!snapshot.exists) {
      return false;
    }

    const status = parseDeletionJobStatus(snapshot.data()?.status);
    if (status !== 'queued') {
      return false;
    }

    tx.set(
      jobRef,
      {
        status: 'processing',
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        attempts: FieldValue.increment(1),
        lastError: null,
      },
      { merge: true },
    );
    return true;
  });
}

async function markDeletionJobCompleted(uid: string, stats: DeletionStats): Promise<void> {
  await createDeletionJobRef(uid).set(
    {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: null,
      deletedCounts: stats,
    },
    { merge: true },
  );
}

async function markDeletionJobFailed(uid: string, error: unknown): Promise<void> {
  await createDeletionJobRef(uid).set(
    {
      status: 'failed',
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastError: error instanceof Error ? error.message : String(error),
    },
    { merge: true },
  );
}

async function processDeletionJob(uid: string): Promise<void> {
  const claimed = await claimDeletionJob(uid);
  if (!claimed) {
    functions.logger.info('Deletion job not claimed; skipping', { uid });
    return;
  }

  try {
    const stats = await executeAccountDeletion(uid);
    await markDeletionJobCompleted(uid, stats);
  } catch (error) {
    await markDeletionJobFailed(uid, error);
    functions.logger.error('Deletion job failed', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const requestAccountDeletion = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (_data, context): Promise<RequestAccountDeletionResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Debes estar autenticado para eliminar tu cuenta.',
      );
    }

    const uid = context.auth.uid;

    try {
      const status = await upsertDeletionJobFromCallable(uid);
      await admin
        .auth()
        .revokeRefreshTokens(uid)
        .catch((error) => {
          functions.logger.warn('Could not revoke refresh tokens after deletion request', {
            uid,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return {
        accepted: status === 'queued' || status === 'processing' || status === 'completed',
        status,
        jobId: uid,
      };
    } catch (error) {
      functions.logger.error('Failed to enqueue account deletion', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new functions.https.HttpsError(
        'internal',
        'No se pudo iniciar la eliminacion de cuenta. Intenta de nuevo.',
      );
    }
  });

export const getAccountDeletionStatus = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (_data, context): Promise<GetAccountDeletionStatusResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesion.');
    }

    const uid = context.auth.uid;
    const snapshot = await createDeletionJobRef(uid).get();
    if (!snapshot.exists) {
      return {
        status: 'not_requested',
        jobId: null,
        updatedAt: null,
        completedAt: null,
        lastError: null,
      };
    }

    const data = snapshot.data() || {};
    return {
      status: parseDeletionJobStatus(data.status) ?? 'failed',
      jobId: uid,
      updatedAt: toIsoOrNull(data.updatedAt),
      completedAt: toIsoOrNull(data.completedAt),
      lastError: typeof data.lastError === 'string' ? data.lastError : null,
    };
  });

export const onDeletionJobCreated = functions.firestore
  .document(`${DELETION_JOB_COLLECTION}/{uid}`)
  .onCreate(async (_snap, context) => {
    const uid = context.params.uid as string;
    await processDeletionJob(uid);
  });

export const onDeletionJobUpdated = functions.firestore
  .document(`${DELETION_JOB_COLLECTION}/{uid}`)
  .onUpdate(async (change, context) => {
    const beforeStatus = parseDeletionJobStatus(change.before.data()?.status);
    const afterStatus = parseDeletionJobStatus(change.after.data()?.status);
    if (afterStatus !== 'queued' || beforeStatus === 'queued') {
      return;
    }

    const uid = context.params.uid as string;
    await processDeletionJob(uid);
  });

export const deleteUserAccount = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Debes estar autenticado para eliminar tu cuenta.',
      );
    }

    const uid = context.auth.uid;

    try {
      const stats = await executeAccountDeletion(uid);
      await markDeletionJobCompleted(uid, stats);
      return { success: true, deletedCounts: stats };
    } catch (error) {
      functions.logger.error('Account deletion failed (direct callable)', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new functions.https.HttpsError(
        'internal',
        'Error al eliminar la cuenta. Intenta nuevamente en unos minutos.',
      );
    }
  });
