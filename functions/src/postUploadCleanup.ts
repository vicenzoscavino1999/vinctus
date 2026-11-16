import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, SERVER_COLLECTIONS, storagePrefix } from './firestoreContract';
import { isPostReadId } from './postReadAccess';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Unfinished uploads stay recoverable for a week: a reopened local draft keeps
 * its post ID and reuses complete objects. Activity (new objects) extends it.
 */
export const ABANDONED_UPLOAD_AFTER_MS = 7 * DAY_MS;
/** Resumable sessions authorized before retirement can finish for up to 7 days. */
export const LATE_UPLOAD_GRACE_MS = 8 * DAY_MS;
/** Exclusive lease while deleting Storage objects so concurrent runs never overlap. */
export const CLEANUP_LEASE_MS = 15 * MINUTE_MS;
export const ABANDONED_POST_STATUS = 'abandoned';
export const UNFINISHED_POST_STATUSES = ['uploading', 'failed'] as const;

export type PostUploadCleanupReport = {
  scanned: number;
  retired: number;
  skippedActive: number;
  skippedChanged: number;
  purged: number;
  tombstonesRemoved: number;
  objectsDeleted: number;
  failures: number;
};

type CleanupOptions = { now?: Date; limit?: number };

const emptyReport = (): PostUploadCleanupReport => ({
  scanned: 0,
  retired: 0,
  skippedActive: 0,
  skippedChanged: 0,
  purged: 0,
  tombstonesRemoved: 0,
  objectsDeleted: 0,
  failures: 0,
});

const millis = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;

export const postUploadPrefix = (authorId: unknown, postId: unknown): string | null =>
  isPostReadId(authorId) && isPostReadId(postId)
    ? storagePrefix('postImage', { userId: authorId, postId })
    : null;

export const isUnfinishedPostStatus = (status: unknown): boolean =>
  (UNFINISHED_POST_STATUSES as readonly unknown[]).includes(status);

const isDeletionJobActive = (status: unknown): boolean =>
  typeof status === 'string' && ['queued', 'running', 'completed'].includes(status);

/**
 * Fields of a server-owned tombstone. The ID stays reserved while its objects are
 * purged; user text is removed because the local draft is the recoverable copy.
 */
export const abandonedPostFields = (
  data: DocumentData,
  postId: string,
  dueAt: Timestamp,
): DocumentData => ({
  postId,
  authorId: data.authorId,
  status: ABANDONED_POST_STATUS,
  abandonedFrom: typeof data.status === 'string' ? data.status : null,
  abandonedAt: FieldValue.serverTimestamp(),
  mediaCleanupDueAt: dueAt,
  mediaCleanupPass: 0,
  title: null,
  text: '',
  content: FieldValue.delete(),
  media: [],
  likeCount: 0,
  commentCount: 0,
  groupId: data.groupId ?? null,
  categoryId: data.categoryId ?? null,
  createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

async function deletePrefix(bucket: Bucket, prefix: string): Promise<number> {
  // Include noncurrent generations so a versioned bucket keeps no hidden copies.
  const [files] = await bucket.getFiles({ prefix, versions: true });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

export async function deletePostUploadPrefix(
  bucket: Bucket,
  authorId: unknown,
  postId: unknown,
): Promise<number> {
  const prefix = postUploadPrefix(authorId, postId);
  if (!prefix) return 0;
  return deletePrefix(bucket, prefix);
}

async function hasRecentObject(bucket: Bucket, prefix: string, cutoffMs: number) {
  const [files] = await bucket.getFiles({ prefix });
  return files.some((file) => {
    const created = Date.parse(String(file.metadata.timeCreated ?? ''));
    const updated = Date.parse(String(file.metadata.updated ?? ''));
    return (
      !Number.isFinite(created) ||
      created > cutoffMs ||
      (Number.isFinite(updated) && updated > cutoffMs)
    );
  });
}

/**
 * Retire an unfinished upload only if it is still unfinished and stale inside the
 * transaction. A post that reached `ready` (even with a lost acknowledgement) is
 * never touched, and clients cannot finalize an `abandoned` post (rules).
 */
async function retire(
  db: Firestore,
  ref: DocumentReference,
  cutoff: number,
  dueAt: Timestamp,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    if (!data || !isUnfinishedPostStatus(data.status)) return false;
    const created = millis(data.createdAt);
    const updated = millis(data.updatedAt);
    if (created == null || created > cutoff || (updated != null && updated > cutoff)) return false;
    if (!postUploadPrefix(data.authorId, ref.id)) return false;
    tx.update(ref, abandonedPostFields(data, ref.id, dueAt));
    return true;
  });
}

async function retireStaleUploads(
  db: Firestore,
  bucket: Bucket,
  now: number,
  limit: number,
  report: PostUploadCleanupReport,
) {
  const cutoff = now - ABANDONED_UPLOAD_AFTER_MS;
  const stale = await db
    .collection(COLLECTIONS.posts)
    .where('status', 'in', [...UNFINISHED_POST_STATUSES])
    .where('createdAt', '<=', Timestamp.fromMillis(cutoff))
    .orderBy('createdAt')
    .limit(limit)
    .get();
  for (const doc of stale.docs) {
    report.scanned += 1;
    try {
      const prefix = postUploadPrefix(doc.get('authorId'), doc.id);
      if (!prefix) {
        report.skippedChanged += 1;
        continue;
      }
      // Objects created recently mean a client is still retrying this draft.
      if (await hasRecentObject(bucket, prefix, cutoff)) {
        report.skippedActive += 1;
        continue;
      }
      if (await retire(db, doc.ref, cutoff, Timestamp.fromMillis(now))) report.retired += 1;
      else report.skippedChanged += 1;
    } catch {
      report.failures += 1;
    }
  }
}

/**
 * Two passes: immediately, and again after any authorized resumable upload could
 * have finished. Each pass claims a lease in Firestore before touching Storage so
 * concurrent workers never overlap or delete objects of a recreated post.
 */
async function purgeAbandonedMedia(
  db: Firestore,
  bucket: Bucket,
  now: number,
  limit: number,
  report: PostUploadCleanupReport,
) {
  const due = await db
    .collection(COLLECTIONS.posts)
    .where('mediaCleanupDueAt', '<=', Timestamp.fromMillis(now))
    .orderBy('mediaCleanupDueAt')
    .limit(limit)
    .get();
  for (const doc of due.docs) {
    try {
      const claimId = randomUUID();
      const claimed = await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        const latest = current.data();
        const dueAt = millis(latest?.mediaCleanupDueAt);
        const prefix = postUploadPrefix(latest?.authorId, doc.id);
        if (
          !latest ||
          latest.status !== ABANDONED_POST_STATUS ||
          !prefix ||
          dueAt == null ||
          dueAt > now
        )
          return null;
        const pass = typeof latest.mediaCleanupPass === 'number' ? latest.mediaCleanupPass : 0;
        tx.update(doc.ref, {
          mediaCleanupClaimId: claimId,
          mediaCleanupDueAt: Timestamp.fromMillis(now + CLEANUP_LEASE_MS),
        });
        return { prefix, pass, authorId: String(latest.authorId) };
      });
      if (!claimed) {
        report.skippedChanged += 1;
        continue;
      }
      report.objectsDeleted += await deletePrefix(bucket, claimed.prefix);
      const outcome = await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        const latest = current.data();
        if (
          !latest ||
          latest.status !== ABANDONED_POST_STATUS ||
          latest.mediaCleanupClaimId !== claimId
        )
          return 'changed';
        const [author, deletionJob] = await Promise.all([
          tx.get(db.collection(COLLECTIONS.users).doc(claimed.authorId)),
          tx.get(db.collection(SERVER_COLLECTIONS.deletionJobs).doc(claimed.authorId)),
        ]);
        const accountGone = !author.exists || isDeletionJobActive(deletionJob.data()?.status);
        // Deleted accounts cannot start new uploads; their prefix is already removed.
        if (claimed.pass >= 1 || accountGone) {
          tx.delete(doc.ref);
          return 'removed';
        }
        tx.update(doc.ref, {
          mediaCleanupPass: 1,
          mediaCleanupClaimId: FieldValue.delete(),
          mediaCleanupDueAt: Timestamp.fromMillis(now + LATE_UPLOAD_GRACE_MS),
          mediaCleanedAt: FieldValue.serverTimestamp(),
        });
        return 'purged';
      });
      if (outcome === 'changed') report.skippedChanged += 1;
      else if (outcome === 'removed') report.tombstonesRemoved += 1;
      else report.purged += 1;
    } catch {
      report.failures += 1;
    }
  }
}

export async function cleanupAbandonedPostUploads(
  db: Firestore,
  bucket: Bucket,
  { now = new Date(), limit = 50 }: CleanupOptions = {},
): Promise<PostUploadCleanupReport> {
  const report = emptyReport();
  const at = now.getTime();
  await retireStaleUploads(db, bucket, at, limit, report);
  await purgeAbandonedMedia(db, bucket, at, limit, report);
  return report;
}

/**
 * An author removed an unfinished post. Reserve its ID with a tombstone so another
 * device cannot reuse objects that are about to be purged; if a retry already
 * recreated the post, that attempt owns the paths and nothing is deleted.
 */
export async function reserveDeletedUnfinishedPost(
  db: Firestore,
  postId: string,
  deleted: DocumentData,
  now = new Date(),
): Promise<boolean> {
  if (!isUnfinishedPostStatus(deleted.status) || !postUploadPrefix(deleted.authorId, postId))
    return false;
  const authorId = String(deleted.authorId);
  const ref = db.collection(COLLECTIONS.posts).doc(postId);
  return db.runTransaction(async (tx) => {
    const [current, author, deletionJob] = await Promise.all([
      tx.get(ref),
      tx.get(db.collection(COLLECTIONS.users).doc(authorId)),
      tx.get(db.collection(SERVER_COLLECTIONS.deletionJobs).doc(authorId)),
    ]);
    if (current.exists) return false;
    // Account deletion removes posts/{uid}/ itself and must not leave new documents.
    if (!author.exists || isDeletionJobActive(deletionJob.data()?.status)) return false;
    const fields = abandonedPostFields(deleted, postId, Timestamp.fromMillis(now.getTime()));
    delete fields.content;
    tx.create(ref, fields);
    return true;
  });
}
