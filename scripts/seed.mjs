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

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  });
}

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

const now = admin.firestore.FieldValue.serverTimestamp();

const users = [
  {
    uid: 'user_a',
    email: 'alice@vinctus.local',
    password: 'password123',
    displayName: 'Alice V.',
    username: 'alice',
  },
  {
    uid: 'user_b',
    email: 'bob@vinctus.local',
    password: 'password123',
    displayName: 'Bob N.',
    username: 'bob',
  },
  {
    uid: 'user_c',
    email: 'carla@vinctus.local',
    password: 'password123',
    displayName: 'Carla R.',
    username: 'carla',
  },
];

const defaultPrivacy = {
  accountVisibility: 'public',
  allowDirectMessages: true,
  showOnlineStatus: true,
  showLastActive: true,
  allowFriendRequests: true,
  blockedUsers: [],
};

const defaultNotifications = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsOnly: false,
  weeklyDigest: false,
  productUpdates: true,
};

async function upsertAuthUser(user) {
  try {
    await auth.deleteUser(user.uid);
  } catch {
    // ignore
  }
  await auth.createUser({
    uid: user.uid,
    email: user.email,
    password: user.password,
    displayName: user.displayName,
    emailVerified: true,
  });
}

async function seedUsers() {
  for (const user of users) {
    await upsertAuthUser(user);

    const userPayload = {
      uid: user.uid,
      displayName: user.displayName,
      displayNameLowercase: user.displayName.toLowerCase(),
      email: user.email,
      photoURL: null,
      phoneNumber: null,
      reputation: 0,
      karmaGlobal: 0,
      karmaByInterest: {},
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      settings: {
        privacy: defaultPrivacy,
        notifications: defaultNotifications,
      },
      createdAt: now,
      updatedAt: now,
    };

    const publicPayload = {
      uid: user.uid,
      displayName: user.displayName,
      displayNameLowercase: user.displayName.toLowerCase(),
      photoURL: null,
      username: user.username,
      accountVisibility: 'public',
      reputation: 0,
      karmaGlobal: 0,
      karmaByInterest: {},
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      updatedAt: now,
    };

    await db.doc(`users/${user.uid}`).set(userPayload, { merge: false });
    await db.doc(`users_public/${user.uid}`).set(publicPayload, { merge: false });
  }
}

async function seedGroupsAndPosts() {
  const groupId = '1';
  const owner = users[0];

  await db.doc(`groups/${groupId}`).set(
    {
      name: 'Mecanica Cuantica',
      description: 'Grupo seed para emuladores',
      categoryId: 'science',
      visibility: 'public',
      ownerId: owner.uid,
      iconUrl: null,
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    },
    { merge: false },
  );

  await db.doc(`groups/${groupId}/members/${owner.uid}`).set(
    {
      uid: owner.uid,
      groupId,
      role: 'admin',
      joinedAt: now,
    },
    { merge: false },
  );

  await db.doc(`users/${owner.uid}/memberships/${groupId}`).set(
    {
      groupId,
      joinedAt: now,
    },
    { merge: false },
  );

  const posts = [
    {
      id: 'post_1',
      author: users[0],
      content: 'Hola mundo desde el seed de Vinctus.',
    },
    {
      id: 'post_2',
      author: users[1],
      content: 'Segundo post para pruebas locales.',
    },
  ];

  for (const post of posts) {
    await db.doc(`posts/${post.id}`).set(
      {
        authorId: post.author.uid,
        authorName: post.author.displayName,
        authorUsername: post.author.username,
        authorPhoto: null,
        title: null,
        content: post.content,
        media: [],
        groupId,
        categoryId: 'science',
        likeCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: null,
      },
      { merge: false },
    );
  }

  await db.doc(`users/${users[0].uid}`).set({ postsCount: 1, updatedAt: now }, { merge: true });
  await db.doc(`users_public/${users[0].uid}`).set({ postsCount: 1, updatedAt: now }, { merge: true });
  await db.doc(`users/${users[1].uid}`).set({ postsCount: 1, updatedAt: now }, { merge: true });
  await db.doc(`users_public/${users[1].uid}`).set({ postsCount: 1, updatedAt: now }, { merge: true });
}

async function seedConversation() {
  const uid1 = users[0].uid;
  const uid2 = users[1].uid;
  const memberIds = [uid1, uid2].sort();
  const conversationId = `dm_${memberIds.join('_')}`;

  const lastMessage = {
    text: 'Hola desde el seed',
    senderId: uid1,
    senderName: users[0].displayName,
    senderPhotoURL: null,
    createdAt: now,
    clientCreatedAt: Date.now(),
  };

  await db.doc(`conversations/${conversationId}`).set(
    {
      type: 'direct',
      memberIds,
      lastMessage,
      createdAt: now,
      updatedAt: now,
    },
    { merge: false },
  );

  const memberPayload = (uid) => ({
    uid,
    role: 'member',
    joinedAt: now,
    lastReadClientAt: Date.now(),
    lastReadAt: now,
    muted: false,
    mutedUntil: null,
  });

  await db.doc(`conversations/${conversationId}/members/${uid1}`).set(memberPayload(uid1), { merge: false });
  await db.doc(`conversations/${conversationId}/members/${uid2}`).set(memberPayload(uid2), { merge: false });

  const message1 = {
    senderId: uid1,
    senderName: users[0].displayName,
    senderPhotoURL: null,
    text: 'Hola, todo bien?',
    createdAt: now,
    clientCreatedAt: Date.now(),
    clientId: 'msg_1',
  };

  const message2 = {
    senderId: uid2,
    senderName: users[1].displayName,
    senderPhotoURL: null,
    text: 'Listo para probar el emulador.',
    createdAt: now,
    clientCreatedAt: Date.now() + 1,
    clientId: 'msg_2',
  };

  await db.doc(`conversations/${conversationId}/messages/${message1.clientId}`).set(message1, { merge: false });
  await db.doc(`conversations/${conversationId}/messages/${message2.clientId}`).set(message2, { merge: false });

  const indexPayload = (uid, otherUid) => ({
    conversationId,
    otherUid,
    type: 'direct',
    updatedAt: now,
  });

  await db.doc(`users/${uid1}/directConversations/${conversationId}`).set(indexPayload(uid1, uid2), { merge: true });
  await db.doc(`users/${uid2}/directConversations/${conversationId}`).set(indexPayload(uid2, uid1), { merge: true });
}

async function seedStorage() {
  const file = bucket.file('seed/sample.txt');
  await file.save(Buffer.from('Seed file for local emulator.'), {
    contentType: 'text/plain',
  });
}

async function main() {
  console.log(`Seeding Firebase emulators for project: ${projectId}`);
  await seedUsers();
  await seedGroupsAndPosts();
  await seedConversation();
  await seedStorage();
  console.log('Seed complete.');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
