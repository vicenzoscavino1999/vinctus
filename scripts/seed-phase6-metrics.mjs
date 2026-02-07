import { config as loadEnv } from 'dotenv';
import admin from 'firebase-admin';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'vinctus-dev';

const emulatorHost = process.env.FIREBASE_EMULATOR_HOST || '127.0.0.1';
process.env.FIRESTORE_EMULATOR_HOST ||= `${emulatorHost}:8080`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= `${emulatorHost}:9099`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= `${emulatorHost}:9199`;
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_PROJECT_ID = projectId;

const EXTRA_POSTS = Math.max(
  30,
  Math.min(300, Number.parseInt(process.env.PHASE6_EXTRA_POSTS || '120', 10) || 120),
);
const EXTRA_DIRECT_CONVERSATIONS = Math.max(
  20,
  Math.min(
    250,
    Number.parseInt(process.env.PHASE6_EXTRA_DIRECT_CONVERSATIONS || '80', 10) || 80,
  ),
);

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  });
}

const db = admin.firestore();

const toTimestamp = (minutesAgo) =>
  admin.firestore.Timestamp.fromMillis(Date.now() - Math.max(0, minutesAgo) * 60_000);

const baseUsers = [
  {
    uid: 'user_a',
    displayName: 'Alice V.',
    username: 'alice',
  },
  {
    uid: 'user_b',
    displayName: 'Bob N.',
    username: 'bob',
  },
  {
    uid: 'user_c',
    displayName: 'Carla R.',
    username: 'carla',
  },
];

const chunk = (items, size) => {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

const commitWrites = async (writes) => {
  for (const group of chunk(writes, 450)) {
    const batch = db.batch();
    group.forEach((item) => {
      if (item.kind === 'set') {
        batch.set(item.ref, item.data, item.options ?? { merge: false });
      } else {
        batch.delete(item.ref);
      }
    });
    await batch.commit();
  }
};

const seedFeedPosts = async () => {
  const writes = [];
  const targetIds = new Set();

  for (let i = 0; i < EXTRA_POSTS; i += 1) {
    const seq = String(i + 1).padStart(3, '0');
    const postId = `metric_post_${seq}`;
    targetIds.add(postId);

    const author = baseUsers[i % baseUsers.length];
    writes.push({
      kind: 'set',
      ref: db.doc(`posts/${postId}`),
      data: {
        authorId: author.uid,
        authorName: author.displayName,
        authorUsername: author.username,
        authorPhoto: null,
        title: `Publicacion metric ${seq}`,
        content: `Contenido de carga para metricas phase6 #${seq}`,
        media: [],
        groupId: '1',
        categoryId: 'science',
        likeCount: 0,
        commentCount: 0,
        status: 'ready',
        createdAt: toTimestamp(i),
        updatedAt: null,
      },
      options: { merge: false },
    });
  }

  const existing = await db.collection('posts').listDocuments();
  existing.forEach((ref) => {
    if (ref.id.startsWith('metric_post_') && !targetIds.has(ref.id)) {
      writes.push({ kind: 'delete', ref });
    }
  });

  await commitWrites(writes);
};

const metricUser = (index) => {
  const suffix = String(index).padStart(3, '0');
  return {
    uid: `metric_user_${suffix}`,
    displayName: `Metric User ${suffix}`,
    username: `metric${suffix}`,
  };
};

const conversationIdFor = (uidA, uidB) => {
  const memberIds = [uidA, uidB].sort();
  return {
    id: `dm_${memberIds.join('_')}`,
    memberIds,
  };
};

const seedDirectConversations = async () => {
  const writes = [];
  const targetConversationIds = new Set();

  for (let i = 0; i < EXTRA_DIRECT_CONVERSATIONS; i += 1) {
    const user = metricUser(i + 1);
    const createdAt = toTimestamp(i);
    const { id: conversationId, memberIds } = conversationIdFor('user_a', user.uid);
    targetConversationIds.add(conversationId);

    writes.push(
      {
        kind: 'set',
        ref: db.doc(`users/${user.uid}`),
        data: {
          uid: user.uid,
          displayName: user.displayName,
          displayNameLowercase: user.displayName.toLowerCase(),
          email: `${user.username}@vinctus.local`,
          photoURL: null,
          reputation: 0,
          karmaGlobal: 0,
          karmaByInterest: {},
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          createdAt,
          updatedAt: createdAt,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`users_public/${user.uid}`),
        data: {
          uid: user.uid,
          displayName: user.displayName,
          displayNameLowercase: user.displayName.toLowerCase(),
          username: user.username,
          photoURL: null,
          accountVisibility: 'public',
          reputation: 0,
          karmaGlobal: 0,
          karmaByInterest: {},
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          updatedAt: createdAt,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`conversations/${conversationId}`),
        data: {
          type: 'direct',
          memberIds,
          lastMessage: {
            text: `Mensaje seed ${i + 1}`,
            senderId: user.uid,
            senderName: user.displayName,
            senderPhotoURL: null,
            createdAt,
            clientCreatedAt: Date.now() - i * 1000,
          },
          createdAt,
          updatedAt: createdAt,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`conversations/${conversationId}/members/user_a`),
        data: {
          uid: 'user_a',
          role: 'member',
          joinedAt: createdAt,
          lastReadClientAt: Date.now(),
          lastReadAt: createdAt,
          muted: false,
          mutedUntil: null,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`conversations/${conversationId}/members/${user.uid}`),
        data: {
          uid: user.uid,
          role: 'member',
          joinedAt: createdAt,
          lastReadClientAt: Date.now(),
          lastReadAt: createdAt,
          muted: false,
          mutedUntil: null,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`users/user_a/directConversations/${conversationId}`),
        data: {
          conversationId,
          otherUid: user.uid,
          type: 'direct',
          updatedAt: createdAt,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`users/${user.uid}/directConversations/${conversationId}`),
        data: {
          conversationId,
          otherUid: 'user_a',
          type: 'direct',
          updatedAt: createdAt,
        },
        options: { merge: true },
      },
      {
        kind: 'set',
        ref: db.doc(`conversations/${conversationId}/messages/metric_seed_1`),
        data: {
          senderId: user.uid,
          senderName: user.displayName,
          senderPhotoURL: null,
          text: `Mensaje inicial ${i + 1}`,
          attachments: [],
          createdAt,
          clientCreatedAt: Date.now() - i * 1000,
          clientId: `metric_seed_${i + 1}`,
        },
        options: { merge: true },
      },
    );
  }

  const userDirectIndexDocs = await db.collection('users/user_a/directConversations').listDocuments();
  userDirectIndexDocs.forEach((ref) => {
    if (ref.id.includes('metric_user_') && !targetConversationIds.has(ref.id)) {
      writes.push({ kind: 'delete', ref });
    }
  });

  await commitWrites(writes);
};

const main = async () => {
  console.log(`Seeding Phase6 metrics dataset for project: ${projectId}`);
  console.log(`- EXTRA_POSTS: ${EXTRA_POSTS}`);
  console.log(`- EXTRA_DIRECT_CONVERSATIONS: ${EXTRA_DIRECT_CONVERSATIONS}`);

  await seedFeedPosts();
  await seedDirectConversations();

  console.log('Phase6 metrics seed complete.');
};

main().catch((error) => {
  console.error('Phase6 metrics seed failed:', error);
  process.exit(1);
});
