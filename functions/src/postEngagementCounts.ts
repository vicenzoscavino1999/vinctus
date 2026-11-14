import {
  FieldPath,
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';

export const KARMA_PER_LIKE = 2;
const REPUTATION_MAX = 100;
const LEGACY_CATEGORY_PREFIX = 'karmaByInterest.';

const validNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): number => (validNumber(value) ? Math.max(0, value) : 0);

/** The field used by the previous handler is the karma contribution already applied. */
export function appliedLikeCount(post: DocumentData): number {
  return nonnegative(validNumber(post.likesCount) ? post.likesCount : post.likeCount);
}

export function legacyCategoryFields(data: DocumentData): string[] {
  return Object.keys(data).filter(
    (key) => key.startsWith(LEGACY_CATEGORY_PREFIX) && key.length > LEGACY_CATEGORY_PREFIX.length,
  );
}

export function planPostKarma(data: DocumentData, categoryId: string | null, likeDelta: number) {
  const byInterest: Record<string, number> = Object.create(null);
  const nested = data.karmaByInterest;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested)) byInterest[key] = nonnegative(value);
  }
  // Old set(..., merge:true) treated dotted keys literally. Move their values,
  // never add them a second time if the real map already has that category.
  for (const key of legacyCategoryFields(data)) {
    const category = key.slice(LEGACY_CATEGORY_PREFIX.length);
    if (!(category in byInterest)) byInterest[category] = nonnegative(data[key]);
  }
  const delta = likeDelta * KARMA_PER_LIKE;
  const previousKarma = validNumber(data.karmaGlobal) ? data.karmaGlobal : data.reputation;
  const karmaGlobal = Math.max(0, nonnegative(previousKarma) + delta);
  if (categoryId) byInterest[categoryId] = Math.max(0, (byInterest[categoryId] ?? 0) + delta);
  return {
    karmaGlobal,
    reputation: Math.min(REPUTATION_MAX, karmaGlobal),
    karmaByInterest: byInterest,
  };
}

function sameBuckets(current: unknown, expected: Record<string, number>): boolean {
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
  const map = current as Record<string, unknown>;
  return (
    Object.keys(map).length === Object.keys(expected).length &&
    Object.keys(expected).every((key) => map[key] === expected[key])
  );
}

function writeExistingProfile(
  tx: Transaction,
  snapshot: DocumentSnapshot | undefined,
  fields: ReturnType<typeof planPostKarma>,
) {
  if (!snapshot?.exists) return;
  const data = snapshot.data() ?? {};
  const legacy = legacyCategoryFields(data);
  if (
    data.karmaGlobal !== fields.karmaGlobal ||
    data.reputation !== fields.reputation ||
    !sameBuckets(data.karmaByInterest, fields.karmaByInterest) ||
    legacy.length
  ) {
    tx.update(snapshot.ref, { ...fields, updatedAt: FieldValue.serverTimestamp() });
  }
  // FieldPath keeps each old dotted key literal; a string path would delete the
  // newly corrected nested bucket instead of the old field.
  if (legacy.length) {
    const rest = legacy.slice(1).flatMap((key) => [new FieldPath(key), FieldValue.delete()]);
    tx.update(snapshot.ref, new FieldPath(legacy[0]), FieldValue.delete(), ...rest);
  }
}

function authorIdOf(data: DocumentData | undefined): string | null {
  const id = data?.authorId;
  return typeof id === 'string' && id.length > 0 && !id.includes('/') ? id : null;
}

/** Exact current membership count; event IDs/order never determine the result. */
export async function reconcilePostLikes(db: Firestore, postId: string): Promise<void> {
  const postRef = db.collection(COLLECTIONS.posts).doc(postId);
  // Read the author hint before locking. Profile -> post lock order matches
  // reconcileUserPostCount, avoiding a user/post lock inversion on publication.
  const hint = await postRef.get();
  if (!hint.exists) return;
  const authorId = authorIdOf(hint.data());
  await db.runTransaction(async (tx) => {
    let user: DocumentSnapshot | undefined;
    let publicUser: DocumentSnapshot | undefined;
    if (authorId) {
      user = await tx.get(db.collection(COLLECTIONS.users).doc(authorId));
      if (user.exists)
        publicUser = await tx.get(db.collection(COLLECTIONS.usersPublic).doc(authorId));
    }
    const post = await tx.get(postRef);
    if (!post.exists) return;
    const data = post.data() ?? {};
    if (authorIdOf(data) !== authorId)
      throw new Error('Post author changed during reconciliation; retry the event.');
    const total = (await tx.get(postRef.collection(SUBCOLLECTIONS.likes).count())).data().count;
    const delta = total - appliedLikeCount(data);
    if (user?.exists) {
      const fields = planPostKarma(
        user.data() ?? {},
        typeof data.categoryId === 'string' && data.categoryId ? data.categoryId : null,
        delta,
      );
      writeExistingProfile(tx, user, fields);
      writeExistingProfile(tx, publicUser, fields);
    }
    writeCount(tx, postRef, data, 'likeCount', 'likesCount', total);
  });
}

export async function reconcilePostComments(db: Firestore, postId: string): Promise<void> {
  const postRef = db.collection(COLLECTIONS.posts).doc(postId);
  await db.runTransaction(async (tx) => {
    const post = await tx.get(postRef);
    if (!post.exists) return;
    const total = (await tx.get(postRef.collection(SUBCOLLECTIONS.comments).count())).data().count;
    writeCount(tx, postRef, post.data() ?? {}, 'commentCount', 'commentsCount', total);
  });
}

function writeCount(
  tx: Transaction,
  ref: DocumentReference,
  data: DocumentData,
  first: string,
  second: string,
  total: number,
) {
  if (data[first] !== total || data[second] !== total) {
    tx.update(ref, { [first]: total, [second]: total, updatedAt: FieldValue.serverTimestamp() });
  }
}
