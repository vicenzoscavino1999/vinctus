import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';
import {
  appliedLikeCount,
  KARMA_PER_LIKE,
  legacyCategoryFields,
  planPostKarma,
} from './postEngagementCounts';

/** Bounded, read-only evidence for an explicit author; never infers missing historical points. */
export async function auditPostEngagement(db: Firestore, uid: string, maxPosts = 100) {
  if (!uid || uid.includes('/')) throw new Error('A single valid author UID is required.');
  if (!Number.isInteger(maxPosts) || maxPosts < 1 || maxPosts > 1000)
    throw new Error('maxPosts must be between 1 and 1000.');
  const startedAt = new Date().toISOString();
  const [user, publicUser] = await db.getAll(
    db.collection(COLLECTIONS.users).doc(uid),
    db.collection(COLLECTIONS.usersPublic).doc(uid),
  );
  const snapshot = await db
    .collection(COLLECTIONS.posts)
    .where('authorId', '==', uid)
    .orderBy(FieldPath.documentId())
    .select('categoryId', 'likeCount', 'likesCount', 'commentCount', 'commentsCount')
    .limit(maxPosts + 1)
    .get();
  const documents = snapshot.docs.slice(0, maxPosts);
  const posts: Array<{
    postId: string;
    categoryId: string | null;
    likes: number;
    comments: number;
    appliedLikes: number;
    aliasesMatch: boolean;
  }> = [];
  // Limit aggregate RPC fan-out while keeping the whole audit read-only.
  for (let offset = 0; offset < documents.length; offset += 5) {
    posts.push(
      ...(await Promise.all(
        documents.slice(offset, offset + 5).map(async (post) => {
          const data = post.data();
          const [likes, comments] = await Promise.all([
            post.ref.collection(SUBCOLLECTIONS.likes).count().get(),
            post.ref.collection(SUBCOLLECTIONS.comments).count().get(),
          ]);
          return {
            postId: post.id,
            categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
            likes: likes.data().count,
            comments: comments.data().count,
            appliedLikes: appliedLikeCount(data),
            aliasesMatch:
              data.likeCount === likes.data().count &&
              data.likesCount === likes.data().count &&
              data.commentCount === comments.data().count &&
              data.commentsCount === comments.data().count,
          };
        }),
      )),
    );
  }
  const fields = planPostKarma(user.data() ?? {}, null, 0);
  const publicFields = planPostKarma(publicUser.data() ?? {}, null, 0);
  const knownKarmaByCategory: Record<string, number> = Object.create(null);
  for (const post of posts) {
    if (post.categoryId)
      knownKarmaByCategory[post.categoryId] =
        (knownKarmaByCategory[post.categoryId] ?? 0) + post.likes * KARMA_PER_LIKE;
  }
  const knownCurrentPostKarma = posts.reduce((sum, post) => sum + post.likes * KARMA_PER_LIKE, 0);
  return {
    uid,
    startedAt,
    finishedAt: new Date().toISOString(),
    transactionalSnapshot: false,
    inspectedPosts: posts.length,
    complete: snapshot.docs.length <= maxPosts,
    privateProfileExists: user.exists,
    publicProfileExists: publicUser.exists,
    storedKarmaGlobal: user.exists ? fields.karmaGlobal : null,
    storedPublicKarmaGlobal: publicUser.exists ? publicFields.karmaGlobal : null,
    knownCurrentPostKarma,
    differenceFromKnownCurrentPosts: user.exists
      ? fields.karmaGlobal - knownCurrentPostKarma
      : null,
    knownKarmaByCategory,
    storedCategoryMap: fields.karmaByInterest,
    storedPublicCategoryMap: publicUser.exists ? publicFields.karmaByInterest : null,
    categoriesBelowKnownCurrentPosts: Object.keys(knownKarmaByCategory).filter(
      (key) => (fields.karmaByInterest[key] ?? 0) < knownKarmaByCategory[key],
    ),
    legacyPrivateFields: legacyCategoryFields(user.data() ?? {}),
    legacyPublicFields: legacyCategoryFields(publicUser.data() ?? {}),
    posts,
    note: 'Read only, potentially partial and not a transactionally consistent snapshot. Historical karma retained after deleted posts and overwritten category totals cannot be reconstructed from this report. No repair is applied.',
  };
}
