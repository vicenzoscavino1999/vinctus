/**
 * Backfill karma from post likes.
 * Usage: node backfill-karma.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const KARMA_PER_LIKE = 2;
const REPUTATION_MAX = 100;

async function getLikesCount(postId) {
  const likesSnap = await db.collection(`posts/${postId}/likes`).get();
  return likesSnap.size;
}

async function backfillKarma() {
  console.log('Backfilling karma from post likes...');

  const postsSnapshot = await db.collection('posts').get();
  if (postsSnapshot.empty) {
    console.log('No posts found.');
    return;
  }

  const karmaByUser = new Map();
  const interestByUser = new Map();

  for (const postDoc of postsSnapshot.docs) {
    const postId = postDoc.id;
    const data = postDoc.data() || {};
    const authorId = typeof data.authorId === 'string' ? data.authorId : null;
    if (!authorId) continue;

    const categoryId =
      typeof data.categoryId === 'string' && data.categoryId.length > 0 ? data.categoryId : null;

    let likesCount =
      typeof data.likesCount === 'number'
        ? data.likesCount
        : typeof data.likeCount === 'number'
          ? data.likeCount
          : null;

    if (likesCount === null) {
      likesCount = await getLikesCount(postId);
    }

    if (!likesCount || likesCount <= 0) {
      continue;
    }

    const delta = likesCount * KARMA_PER_LIKE;
    const current = karmaByUser.get(authorId) || 0;
    karmaByUser.set(authorId, current + delta);

    if (categoryId) {
      const interestMap = interestByUser.get(authorId) || {};
      interestMap[categoryId] = (interestMap[categoryId] || 0) + delta;
      interestByUser.set(authorId, interestMap);
    }
  }

  if (karmaByUser.size === 0) {
    console.log('No karma to update.');
    return;
  }

  console.log(`Updating ${karmaByUser.size} users...`);

  const batchSize = 200; // 2 writes per user (users + users_public)
  let batch = db.batch();
  let opCount = 0;
  let updatedUsers = 0;

  const commitBatch = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };

  for (const [uid, karmaGlobal] of karmaByUser.entries()) {
    const reputation = Math.min(REPUTATION_MAX, Math.max(0, karmaGlobal));
    const karmaByInterest = interestByUser.get(uid) || {};

    const payload = {
      karmaGlobal,
      karmaByInterest,
      reputation,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(db.doc(`users/${uid}`), payload, { merge: true });
    batch.set(db.doc(`users_public/${uid}`), payload, { merge: true });
    opCount += 2;
    updatedUsers += 1;

    if (opCount >= batchSize) {
      await commitBatch();
    }
  }

  await commitBatch();

  console.log(`Done. Updated ${updatedUsers} users.`);
}

async function main() {
  try {
    await backfillKarma();
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

main();
