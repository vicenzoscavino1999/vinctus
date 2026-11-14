import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Dry-run by default. Run with credentials for this explicit project only.
// Never prints object names, URLs, notification bodies, or credentials.
const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
const projectId = process.argv.includes('--project') ? value('--project') : '';
const bucketName = process.argv.includes('--bucket') ? value('--bucket') : '';
assert.match(projectId, /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/);
assert.match(bucketName, /^[a-z0-9][a-z0-9._-]+$/);
const apply = process.argv.includes('--apply');
assert.ok(
  !apply || process.argv.includes('--acknowledge-client-upgrade'),
  'Upgrade both clients before applying.',
);
assert.ok(
  !process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  'Use the integration harness for emulator tests.',
);
const app = initializeApp({ projectId, storageBucket: bucketName });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const stats = {
  apply,
  posts: 0,
  rewrittenPosts: 0,
  unsupportedMedia: 0,
  objects: 0,
  protectedObjects: 0,
  notifications: 0,
  scrubbedNotifications: 0,
};

async function scan(query, visit) {
  let last;
  for (;;) {
    const page = await (last ? query.startAfter(last) : query).limit(200).get();
    if (page.empty) return;
    for (const doc of page.docs) await visit(doc);
    last = page.docs.at(-1);
  }
}

try {
  const [bucketMetadata] = await bucket.getMetadata();
  const uniformAccess = bucketMetadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
  const hasPublicACL = (entries) =>
    entries.some((entry) => ['allUsers', 'allAuthenticatedUsers'].includes(entry.entity));
  const [iam] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
  assert.ok(
    !(iam.bindings ?? []).some((binding) =>
      binding.members?.some((member) => ['allUsers', 'allAuthenticatedUsers'].includes(member)),
    ),
    'Remove public bucket IAM access before continuing.',
  );
  if (!uniformAccess) {
    const [bucketACL] = await bucket.acl.get();
    const [defaultACL] = await bucket.acl.default.get();
    assert.ok(
      !hasPublicACL(bucketACL) && !hasPublicACL(defaultACL),
      'Remove public bucket/default ACL access before continuing.',
    );
  }
  // Revoke old bearer URLs first. Preconditions prevent overwriting concurrent metadata.
  let pageToken;
  do {
    const [files, next] = await bucket.getFiles({
      prefix: 'posts/',
      versions: true,
      maxResults: 200,
      autoPaginate: false,
      pageToken,
    });
    for (const file of files) {
      stats.objects++;
      if (!uniformAccess) {
        const [objectACL] = await file.acl.get();
        assert.ok(!hasPublicACL(objectACL), 'Remove public object ACL access before continuing.');
      }
      const [metadata] = await file.getMetadata();
      if (
        metadata.metadata?.firebaseStorageDownloadTokens ||
        metadata.cacheControl !== 'private,no-store,max-age=0'
      ) {
        stats.protectedObjects++;
        if (apply)
          await file.setMetadata(
            {
              cacheControl: 'private,no-store,max-age=0',
              metadata: { firebaseStorageDownloadTokens: null },
            },
            { ifMetagenerationMatch: metadata.metageneration },
          );
      }
    }
    pageToken = next?.pageToken;
  } while (pageToken);
  await scan(db.collection('posts').orderBy(FieldPath.documentId()), async (doc) => {
    stats.posts++;
    const data = doc.data();
    let changed = false;
    const media = (Array.isArray(data.media) ? data.media : []).map((item) => {
      if (
        item?.type === 'video' &&
        /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/.test(item.url)
      )
        return item;
      const prefix = `posts/${data.authorId}/${doc.id}/`;
      if (
        typeof item?.path !== 'string' ||
        !item.path.startsWith(prefix) ||
        !/^(images|videos|files)\/[^/\u0000-\u001f]+$/.test(item.path.slice(prefix.length))
      ) {
        stats.unsupportedMedia++;
        return item;
      }
      const url = `post-media:${item.path}`;
      if (url !== item.url) changed = true;
      return { ...item, url };
    });
    if (changed) {
      stats.rewrittenPosts++;
      if (apply) await doc.ref.update({ media }, { lastUpdateTime: doc.updateTime });
    }
  });
  await scan(db.collectionGroup('notifications').orderBy(FieldPath.documentId()), async (doc) => {
    stats.notifications++;
    const data = doc.data();
    if (data.postId && (data.postSnippet != null || data.commentText != null)) {
      stats.scrubbedNotifications++;
      if (apply)
        await doc.ref.update(
          { postSnippet: null, commentText: null },
          { lastUpdateTime: doc.updateTime },
        );
    }
  });
  console.log(JSON.stringify(stats));
  if (stats.unsupportedMedia) process.exitCode = 2;
} finally {
  await deleteApp(app);
}
