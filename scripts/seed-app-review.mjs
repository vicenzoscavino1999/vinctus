import { config as loadEnv } from 'dotenv';
import admin from 'firebase-admin';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const useEmulators = process.env.REVIEW_SEED_USE_EMULATORS !== 'false';
const projectId =
  process.env.SEED_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'vinctus-dev';

if (useEmulators) {
  const emulatorHost = process.env.FIREBASE_EMULATOR_HOST || '127.0.0.1';
  process.env.FIRESTORE_EMULATOR_HOST ||= `${emulatorHost}:8080`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= `${emulatorHost}:9099`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= `${emulatorHost}:9199`;
} else if (process.env.ALLOW_LIVE_REVIEW_SEED !== 'true') {
  throw new Error(
    'Live seed blocked. Set REVIEW_SEED_USE_EMULATORS=true (recommended) or ALLOW_LIVE_REVIEW_SEED=true explicitly.',
  );
}

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

const serverNow = admin.firestore.FieldValue.serverTimestamp();

const hoursAgo = (hours) => admin.firestore.Timestamp.fromMillis(Date.now() - hours * 60 * 60 * 1000);
const hoursFromNow = (hours) =>
  admin.firestore.Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);

const REVIEWER_UID = process.env.REVIEW_DEMO_UID || 'reviewer_demo';
const REVIEWER_EMAIL = process.env.REVIEW_DEMO_EMAIL || 'reviewer@vinctus.local';
const REVIEWER_PASSWORD = process.env.REVIEW_DEMO_PASSWORD || 'Review123!';

const users = [
  {
    uid: REVIEWER_UID,
    email: REVIEWER_EMAIL,
    password: REVIEWER_PASSWORD,
    displayName: 'Reviewer Demo',
    username: 'reviewer_demo',
    aiConsent: true,
    role: 'reviewer',
  },
  {
    uid: 'review_peer_1',
    email: 'review.peer1@vinctus.local',
    password: 'Review123!',
    displayName: 'Marina Test',
    username: 'marina_test',
    aiConsent: false,
    role: 'member',
  },
  {
    uid: 'review_peer_2',
    email: 'review.peer2@vinctus.local',
    password: 'Review123!',
    displayName: 'Diego Test',
    username: 'diego_test',
    aiConsent: false,
    role: 'member',
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

const getUser = (uid) => {
  const found = users.find((item) => item.uid === uid);
  if (!found) throw new Error(`Unknown seeded user: ${uid}`);
  return found;
};

const buildDirectConversationId = (uidA, uidB) => {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted.join('_')}`;
};

const upsertAuthUser = async (user) => {
  try {
    await auth.updateUser(user.uid, {
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });
      return;
    }
    throw error;
  }
};

const setUserDocs = async () => {
  for (const user of users) {
    await upsertAuthUser(user);

    await db.doc(`users/${user.uid}`).set(
      {
        uid: user.uid,
        displayName: user.displayName,
        displayNameLowercase: user.displayName.toLowerCase(),
        email: user.email,
        photoURL: null,
        phoneNumber: null,
        reputation: 10,
        karmaGlobal: 10,
        karmaByInterest: {
          science: 6,
          technology: 4,
        },
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        settings: {
          privacy: defaultPrivacy,
          notifications: defaultNotifications,
          ai: {
            consentGranted: user.aiConsent,
            consentSource: user.aiConsent ? 'settings' : null,
            consentUpdatedAt: serverNow,
          },
        },
        createdAt: serverNow,
        updatedAt: serverNow,
      },
      { merge: true },
    );

    await db.doc(`users_public/${user.uid}`).set(
      {
        uid: user.uid,
        displayName: user.displayName,
        displayNameLowercase: user.displayName.toLowerCase(),
        photoURL: null,
        username: user.username,
        accountVisibility: 'public',
        reputation: 10,
        karmaGlobal: 10,
        karmaByInterest: {
          science: 6,
          technology: 4,
        },
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        updatedAt: serverNow,
      },
      { merge: true },
    );
  }
};

const linkFollow = async (followerUid, targetUid, createdAt) => {
  await db.doc(`users/${followerUid}/following/${targetUid}`).set(
    {
      uid: targetUid,
      createdAt,
    },
    { merge: true },
  );
  await db.doc(`users/${targetUid}/followers/${followerUid}`).set(
    {
      uid: followerUid,
      createdAt,
    },
    { merge: true },
  );
};

const linkFriend = async (uidA, uidB, createdAt) => {
  await db.doc(`users/${uidA}/friends/${uidB}`).set(
    {
      uid: uidB,
      createdAt,
    },
    { merge: true },
  );
};

const setSocialGraph = async () => {
  const createdAt = hoursAgo(4);
  await linkFollow(REVIEWER_UID, 'review_peer_1', createdAt);
  await linkFollow(REVIEWER_UID, 'review_peer_2', createdAt);
  await linkFollow('review_peer_1', REVIEWER_UID, createdAt);

  await Promise.all([
    linkFriend(REVIEWER_UID, 'review_peer_1', createdAt),
    linkFriend('review_peer_1', REVIEWER_UID, createdAt),
  ]);

  await db.doc(`users/${REVIEWER_UID}`).set(
    {
      followersCount: 1,
      followingCount: 2,
      updatedAt: serverNow,
    },
    { merge: true },
  );
  await db.doc(`users_public/${REVIEWER_UID}`).set(
    {
      followersCount: 1,
      followingCount: 2,
      updatedAt: serverNow,
    },
    { merge: true },
  );

  await db.doc('users/review_peer_1').set(
    {
      followersCount: 1,
      followingCount: 1,
      updatedAt: serverNow,
    },
    { merge: true },
  );
  await db.doc('users_public/review_peer_1').set(
    {
      followersCount: 1,
      followingCount: 1,
      updatedAt: serverNow,
    },
    { merge: true },
  );

  await db.doc('users/review_peer_2').set(
    {
      followersCount: 1,
      followingCount: 0,
      updatedAt: serverNow,
    },
    { merge: true },
  );
  await db.doc('users_public/review_peer_2').set(
    {
      followersCount: 1,
      followingCount: 0,
      updatedAt: serverNow,
    },
    { merge: true },
  );

  await db.doc(`users/${REVIEWER_UID}/blockedUsers/review_peer_2`).set(
    {
      blockedUid: 'review_peer_2',
      status: 'active',
      blockedAt: createdAt,
    },
    { merge: true },
  );
};

const setGroupAndMemberships = async () => {
  const groupId = 'review_group_science';
  const createdAt = hoursAgo(20);
  const members = [
    { uid: 'review_peer_1', role: 'admin' },
    { uid: REVIEWER_UID, role: 'member' },
    { uid: 'review_peer_2', role: 'member' },
  ];

  await db.doc(`groups/${groupId}`).set(
    {
      name: 'Review Group Science',
      description: 'Dataset for App Review walkthrough.',
      categoryId: 'science',
      visibility: 'public',
      ownerId: 'review_peer_1',
      iconUrl: null,
      memberCount: members.length,
      createdAt,
      updatedAt: createdAt,
    },
    { merge: true },
  );

  for (const member of members) {
    await db.doc(`groups/${groupId}/members/${member.uid}`).set(
      {
        uid: member.uid,
        groupId,
        role: member.role,
        joinedAt: createdAt,
      },
      { merge: true },
    );

    await db.doc(`users/${member.uid}/memberships/${groupId}`).set(
      {
        groupId,
        joinedAt: createdAt,
      },
      { merge: true },
    );
  }

  return groupId;
};

const setPostsAndEngagement = async (groupId) => {
  const postA = {
    id: 'review_post_peer1',
    authorUid: 'review_peer_1',
    title: 'Bienvenida al entorno de revision',
    text: 'Este post existe para validar feed, comments y reportes.',
    createdAt: hoursAgo(6),
  };
  const postB = {
    id: 'review_post_reviewer',
    authorUid: REVIEWER_UID,
    title: 'Checklist de QA interno',
    text: 'Validar login, report, block, AI consent y delete account.',
    createdAt: hoursAgo(2),
  };

  const posts = [postA, postB];

  for (const item of posts) {
    const author = getUser(item.authorUid);
    await db.doc(`posts/${item.id}`).set(
      {
        authorId: author.uid,
        authorSnapshot: {
          displayName: author.displayName,
          photoURL: null,
        },
        authorName: author.displayName,
        authorUsername: author.username,
        authorPhoto: null,
        title: item.title,
        text: item.text,
        content: item.text,
        status: 'ready',
        media: [],
        groupId: groupId,
        categoryId: 'science',
        likeCount: 1,
        commentCount: 1,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
      },
      { merge: true },
    );
  }

  await db.doc(`posts/${postA.id}/comments/review_comment_1`).set(
    {
      postId: postA.id,
      authorId: REVIEWER_UID,
      authorSnapshot: {
        displayName: getUser(REVIEWER_UID).displayName,
        photoURL: null,
      },
      text: 'Comentario seed para validar moderacion y UI.',
      createdAt: hoursAgo(5),
    },
    { merge: true },
  );

  await db.doc(`posts/${postB.id}/comments/review_comment_2`).set(
    {
      postId: postB.id,
      authorId: 'review_peer_2',
      authorSnapshot: {
        displayName: getUser('review_peer_2').displayName,
        photoURL: null,
      },
      text: 'Respuesta de peer para flujo de comments.',
      createdAt: hoursAgo(1.5),
    },
    { merge: true },
  );

  await db.doc(`posts/${postA.id}/likes/${REVIEWER_UID}`).set(
    {
      uid: REVIEWER_UID,
      postId: postA.id,
      createdAt: hoursAgo(4),
    },
    { merge: true },
  );
  await db.doc(`users/${REVIEWER_UID}/likes/${postA.id}`).set(
    {
      postId: postA.id,
      createdAt: hoursAgo(4),
    },
    { merge: true },
  );

  await db.doc(`users/${REVIEWER_UID}/savedPosts/${postA.id}`).set(
    {
      postId: postA.id,
      createdAt: hoursAgo(3),
    },
    { merge: true },
  );

  await db.doc(`users/${REVIEWER_UID}`).set({ postsCount: 1, updatedAt: serverNow }, { merge: true });
  await db.doc(`users_public/${REVIEWER_UID}`).set(
    { postsCount: 1, updatedAt: serverNow },
    { merge: true },
  );
  await db.doc('users/review_peer_1').set({ postsCount: 1, updatedAt: serverNow }, { merge: true });
  await db.doc('users_public/review_peer_1').set(
    { postsCount: 1, updatedAt: serverNow },
    { merge: true },
  );

  return { postA, postB };
};

const setStories = async () => {
  await db.doc('stories/review_story_peer1').set(
    {
      ownerId: 'review_peer_1',
      ownerSnapshot: {
        displayName: getUser('review_peer_1').displayName,
        photoURL: null,
      },
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
      mediaPath: 'stories/review_peer_1/review_story_peer1/story.jpg',
      thumbUrl: null,
      thumbPath: null,
      visibility: 'friends',
      createdAt: hoursAgo(3),
      expiresAt: hoursFromNow(12),
    },
    { merge: true },
  );
};

const setMessaging = async (groupId) => {
  const directConversationId = buildDirectConversationId(REVIEWER_UID, 'review_peer_1');
  const groupConversationId = `grp_${groupId}`;

  await db.doc(`conversations/${directConversationId}`).set(
    {
      type: 'direct',
      memberIds: [REVIEWER_UID, 'review_peer_1'].sort(),
      lastMessage: {
        text: 'Perfecto, la app de review esta lista.',
        senderId: 'review_peer_1',
        senderName: getUser('review_peer_1').displayName,
        senderPhotoURL: null,
        createdAt: hoursAgo(1),
        clientCreatedAt: Date.now() - 60_000,
      },
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(1),
    },
    { merge: true },
  );

  const directMembers = [REVIEWER_UID, 'review_peer_1'];
  for (const uid of directMembers) {
    await db.doc(`conversations/${directConversationId}/members/${uid}`).set(
      {
        uid,
        role: 'member',
        joinedAt: hoursAgo(10),
        lastReadClientAt: Date.now() - 50_000,
        lastReadAt: hoursAgo(0.9),
        muted: false,
        mutedUntil: null,
      },
      { merge: true },
    );
  }

  await db.doc(`conversations/${directConversationId}/messages/review_msg_1`).set(
    {
      senderId: REVIEWER_UID,
      senderName: getUser(REVIEWER_UID).displayName,
      senderPhotoURL: null,
      text: 'Hola, estoy probando el flujo de chat para App Review.',
      attachments: [],
      createdAt: hoursAgo(2),
      clientCreatedAt: Date.now() - 2 * 60_000,
      clientId: 'review_msg_1',
    },
    { merge: true },
  );

  await db.doc(`conversations/${directConversationId}/messages/review_msg_2`).set(
    {
      senderId: 'review_peer_1',
      senderName: getUser('review_peer_1').displayName,
      senderPhotoURL: null,
      text: 'Perfecto, la app de review esta lista.',
      attachments: [],
      createdAt: hoursAgo(1),
      clientCreatedAt: Date.now() - 60_000,
      clientId: 'review_msg_2',
    },
    { merge: true },
  );

  await db.doc(`users/${REVIEWER_UID}/directConversations/${directConversationId}`).set(
    {
      conversationId: directConversationId,
      otherUid: 'review_peer_1',
      type: 'direct',
      updatedAt: hoursAgo(1),
    },
    { merge: true },
  );
  await db.doc(`users/review_peer_1/directConversations/${directConversationId}`).set(
    {
      conversationId: directConversationId,
      otherUid: REVIEWER_UID,
      type: 'direct',
      updatedAt: hoursAgo(1),
    },
    { merge: true },
  );

  await db.doc(`conversations/${groupConversationId}`).set(
    {
      type: 'group',
      groupId,
      lastMessage: {
        text: 'Recordatorio: revisar reportes pendientes.',
        senderId: REVIEWER_UID,
        senderName: getUser(REVIEWER_UID).displayName,
        senderPhotoURL: null,
        createdAt: hoursAgo(0.5),
        clientCreatedAt: Date.now() - 20_000,
      },
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(0.5),
    },
    { merge: true },
  );

  for (const uid of [REVIEWER_UID, 'review_peer_1', 'review_peer_2']) {
    await db.doc(`conversations/${groupConversationId}/members/${uid}`).set(
      {
        uid,
        role: uid === 'review_peer_1' ? 'admin' : 'member',
        joinedAt: hoursAgo(18),
        lastReadClientAt: Date.now() - 10_000,
        lastReadAt: hoursAgo(0.3),
        muted: false,
        mutedUntil: null,
      },
      { merge: true },
    );
  }

  await db.doc(`conversations/${groupConversationId}/messages/review_group_msg_1`).set(
    {
      senderId: REVIEWER_UID,
      senderName: getUser(REVIEWER_UID).displayName,
      senderPhotoURL: null,
      text: 'Recordatorio: revisar reportes pendientes.',
      attachments: [],
      createdAt: hoursAgo(0.5),
      clientCreatedAt: Date.now() - 20_000,
      clientId: 'review_group_msg_1',
    },
    { merge: true },
  );
};

const setModerationSeed = async ({ postA }) => {
  const reportUserId = 'review_report_user';
  const reportPostId = 'review_report_post';

  await db.doc(`reports/${reportUserId}`).set(
    {
      reporterUid: REVIEWER_UID,
      reportedUid: 'review_peer_2',
      reason: 'harassment',
      details: 'Mensaje ofensivo en DM de prueba.',
      conversationId: buildDirectConversationId(REVIEWER_UID, 'review_peer_2'),
      status: 'open',
      createdAt: hoursAgo(1.2),
    },
    { merge: true },
  );

  await db.doc(`reports/${reportPostId}`).set(
    {
      reporterUid: REVIEWER_UID,
      reportedUid: 'review_peer_1',
      reason: 'spam',
      details: `[Post ${postA.id}] contenido repetitivo en pruebas`,
      conversationId: `post_${postA.id}`,
      status: 'open',
      createdAt: hoursAgo(0.9),
    },
    { merge: true },
  );

  await db.doc(`moderation_queue/${reportUserId}`).set(
    {
      reportId: reportUserId,
      reportPath: `reports/${reportUserId}`,
      reporterUid: REVIEWER_UID,
      reportedUid: 'review_peer_2',
      reason: 'harassment',
      details: 'Mensaje ofensivo en DM de prueba.',
      conversationId: buildDirectConversationId(REVIEWER_UID, 'review_peer_2'),
      source: 'reports',
      targetType: 'user',
      priority: 'high',
      status: 'pending',
      reviewAction: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: hoursAgo(1.2),
      updatedAt: hoursAgo(1.2),
    },
    { merge: true },
  );

  await db.doc(`moderation_queue/${reportPostId}`).set(
    {
      reportId: reportPostId,
      reportPath: `reports/${reportPostId}`,
      reporterUid: REVIEWER_UID,
      reportedUid: 'review_peer_1',
      reason: 'spam',
      details: `[Post ${postA.id}] contenido repetitivo en pruebas`,
      conversationId: `post_${postA.id}`,
      source: 'reports',
      targetType: 'post',
      priority: 'medium',
      status: 'in_review',
      reviewAction: 'triage_started',
      reviewNote: 'Caso abierto para validar panel admin.',
      reviewedBy: REVIEWER_UID,
      reviewedAt: hoursAgo(0.8),
      createdAt: hoursAgo(0.9),
      updatedAt: hoursAgo(0.8),
    },
    { merge: true },
  );
};

const setAppAdminAndAuxData = async (groupId) => {
  await db.doc(`app_admins/${REVIEWER_UID}`).set(
    {
      uid: REVIEWER_UID,
      role: 'trust_safety_admin',
      createdAt: serverNow,
      updatedAt: serverNow,
    },
    { merge: true },
  );

  await db.doc('support_tickets/review_support_1').set(
    {
      uid: REVIEWER_UID,
      email: REVIEWER_EMAIL,
      title: 'Demo support ticket',
      message: 'Ticket seeded for App Review walkthrough.',
      status: 'open',
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(5),
    },
    { merge: true },
  );

  await db.doc('events/review_event_1').set(
    {
      title: 'Review Demo Event',
      description: 'Evento publico de ejemplo para QA.',
      startAt: hoursFromNow(36),
      endAt: hoursFromNow(38),
      city: 'San Francisco',
      venue: 'Online',
      capacity: 50,
      attendeesCount: 2,
      visibility: 'public',
      createdBy: 'review_peer_2',
      coverUrl: null,
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(1),
    },
    { merge: true },
  );

  await db.doc('events/review_event_1/attendees/review_peer_2').set(
    {
      uid: 'review_peer_2',
      joinedAt: hoursAgo(8.9),
    },
    { merge: true },
  );
  await db.doc(`events/review_event_1/attendees/${REVIEWER_UID}`).set(
    {
      uid: REVIEWER_UID,
      joinedAt: hoursAgo(8.8),
    },
    { merge: true },
  );

  await db.doc('contributions/review_contribution_1').set(
    {
      userId: REVIEWER_UID,
      title: 'Review contribution sample',
      description: 'Archivo semilla para validar seccion de contribuciones.',
      tags: ['review', 'qa'],
      categoryId: 'science',
      filePath: `contributions/${REVIEWER_UID}/review-sample.txt`,
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(7),
    },
    { merge: true },
  );

  await db.doc('collaborations/review_collab_1').set(
    {
      title: 'Proyecto de validacion App Review',
      context: 'Necesitamos revisar flujo UGC y moderacion.',
      seekingRole: 'Tester funcional',
      mode: 'virtual',
      location: 'Remote',
      level: 'intermedio',
      topic: 'quality-assurance',
      tags: ['qa', 'moderation', 'ios'],
      authorId: 'review_peer_1',
      authorSnapshot: {
        displayName: getUser('review_peer_1').displayName,
        photoURL: null,
      },
      status: 'open',
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(12),
    },
    { merge: true },
  );

  await db.doc('collaboration_requests/review_collab_request_1').set(
    {
      collaborationId: 'review_collab_1',
      collaborationTitle: 'Proyecto de validacion App Review',
      fromUid: REVIEWER_UID,
      toUid: 'review_peer_1',
      status: 'pending',
      message: 'Quiero participar como reviewer de seguridad.',
      fromUserName: getUser(REVIEWER_UID).displayName,
      fromUserPhoto: null,
      createdAt: hoursAgo(11.5),
      updatedAt: hoursAgo(11.5),
    },
    { merge: true },
  );

  await db.doc(`users/${REVIEWER_UID}/memberships/${groupId}`).set(
    {
      groupId,
      joinedAt: hoursAgo(20),
    },
    { merge: true },
  );

  await bucket.file(`contributions/${REVIEWER_UID}/review-sample.txt`).save(
    Buffer.from('review-sample-file'),
    { contentType: 'text/plain' },
  );
};

const main = async () => {
  console.log(`[seed-app-review] project=${projectId} emulators=${useEmulators ? 'true' : 'false'}`);
  await setUserDocs();
  await setSocialGraph();
  const groupId = await setGroupAndMemberships();
  const posts = await setPostsAndEngagement(groupId);
  await setStories();
  await setMessaging(groupId);
  await setModerationSeed(posts);
  await setAppAdminAndAuxData(groupId);

  console.log('[seed-app-review] Demo account ready.');
  console.log(`[seed-app-review] Email: ${REVIEWER_EMAIL}`);
  console.log(`[seed-app-review] Password: ${REVIEWER_PASSWORD}`);
  console.log(`[seed-app-review] UID: ${REVIEWER_UID}`);
};

main().catch((error) => {
  console.error('[seed-app-review] failed:', error);
  process.exit(1);
});
