import { pipeline } from 'node:stream/promises';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions/v1';
import { isPostReadId, postMediaPath, PostReadAccess } from './postReadAccess';
import { readPostsForViewer } from './postReads';
import { COLLECTIONS } from './firestoreContract';

export const POST_MEDIA_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const readPosts = functions
  .runWith({ maxInstances: 10, timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    context.rawRequest.res?.set('Cache-Control', 'private, no-store, max-age=0');
    if (!context.auth)
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Inicia sesión para leer publicaciones.',
      );
    if (context.auth) {
      const token = context.rawRequest.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
      try {
        if (!token) throw new Error('invalid-session');
        const session = await getAuth().verifyIdToken(token, true);
        if (session.uid !== context.auth.uid || session.firebase.sign_in_provider === 'anonymous')
          throw new Error('invalid-session');
      } catch {
        throw new functions.https.HttpsError('unauthenticated', 'Vuelve a iniciar sesión.');
      }
    }
    return readPostsForViewer(getFirestore(), context.auth?.uid ?? null, data);
  });

/** No download tokens or signed URLs: authorize every bounded byte-range request. */
export const readPostMedia = functions
  .runWith({ maxInstances: 10, timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Range, If-Match, X-Firebase-AppCheck',
      'Access-Control-Expose-Headers':
        'Content-Type, Content-Length, Content-Range, ETag, Accept-Ranges',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.status(405).end();
      return;
    }
    let uid: string | null = null;
    const authorization = req.get('Authorization');
    if (!authorization) {
      res.status(401).end();
      return;
    }
    if (authorization) {
      const match = authorization.match(/^Bearer (\S+)$/);
      if (!match) {
        res.status(401).end();
        return;
      }
      try {
        const session = await getAuth().verifyIdToken(match[1], true);
        if (session.firebase.sign_in_provider === 'anonymous') {
          res.status(401).end();
          return;
        }
        uid = session.uid;
      } catch {
        res.status(401).end();
        return;
      }
    }
    const postId = req.query.postId;
    const path = req.query.path;
    if (!isPostReadId(postId) || typeof path !== 'string') {
      res.status(400).end();
      return;
    }
    try {
      const access = new PostReadAccess(getFirestore(), uid);
      const post = await access.get(`${COLLECTIONS.posts}/${postId}`);
      const data = post.data();
      if (
        !data ||
        !(await access.post(data)) ||
        !postMediaPath(path, data.authorId, postId) ||
        !Array.isArray(data.media) ||
        !data.media.some((item) => item?.path === path)
      ) {
        res.status(404).end();
        return;
      }
      const bucket = getStorage().bucket();
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size);
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MEDIA_BYTES) {
        res.status(413).end();
        return;
      }
      if (metadata.generation == null) {
        res.status(503).end();
        return;
      }
      const etag = `"${metadata.generation}:${metadata.md5Hash ?? ''}"`;
      if (req.get('If-Match') && req.get('If-Match') !== etag) {
        res.status(412).end();
        return;
      }
      const safeMime =
        /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|webm|quicktime))$/.test(
          metadata.contentType ?? '',
        ) || DOCUMENT_MIMES.has(metadata.contentType ?? '')
          ? metadata.contentType!
          : 'application/octet-stream';
      res.set({ 'Content-Type': safeMime, ETag: etag, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') {
        res.set('Content-Length', String(size));
        res.status(200).end();
        return;
      }
      const range = req.get('Range');
      let start = 0;
      let end = size - 1;
      if (range) {
        const match = range.match(/^bytes=(\d+)-(\d+)$/);
        if (!match) {
          res.status(416).end();
          return;
        }
        start = Number(match[1]);
        end = Number(match[2]);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end < start ||
          start >= size ||
          end >= size ||
          end - start + 1 > POST_MEDIA_CHUNK_BYTES
        ) {
          res.set('Content-Range', `bytes */${size}`);
          res.status(416).end();
          return;
        }
        res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
      } else if (size > POST_MEDIA_CHUNK_BYTES) {
        res.status(416).end();
        return;
      }
      res.set('Content-Length', String(Math.max(0, end - start + 1)));
      if (!size) {
        res.status(200).end();
        return;
      }
      await pipeline(
        bucket
          .file(path, { generation: metadata.generation })
          .createReadStream({ start, end, validation: false }),
        res,
      );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (!res.headersSent) res.status(code === 404 ? 404 : 503).end();
      else res.destroy();
    }
  });

export async function stripPostMediaDownloadToken(
  name: string | undefined,
  bucket: string | undefined,
) {
  if (!name || !bucket || !/^posts\/[^/]+\/[^/]+\/(images|videos|files)\/[^/]+$/.test(name)) return;
  const file = getStorage().bucket(bucket).file(name);
  try {
    let [metadata] = await file.getMetadata();
    // The Storage emulator keeps downloadTokens separately from custom metadata:
    // a GCS null patch cannot revoke them there and deleting the final token
    // generates another one. Rotate once on loopback; production removes all.
    const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    const localEmulator =
      emulator &&
      /^(127\.0\.0\.1|localhost):9199$/.test(emulator) &&
      process.env.GCLOUD_PROJECT === 'vinctus-dev';
    if (
      localEmulator &&
      metadata.metadata?.postMediaTokenRotated === 'true' &&
      metadata.cacheControl === 'private,no-store,max-age=0'
    )
      return;
    if (localEmulator) {
      for (const token of String(metadata.metadata?.firebaseStorageDownloadTokens ?? '')
        .split(',')
        .filter(Boolean)) {
        const response = await fetch(
          `http://${emulator}/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?${new URLSearchParams({ delete_token: token })}`,
          {
            method: 'POST',
            headers: { Authorization: 'Bearer owner' },
          },
        );
        if (!response.ok) throw new Error('Emulator token revocation failed');
      }
      [metadata] = await file.getMetadata();
    }
    if (
      metadata.metadata?.firebaseStorageDownloadTokens ||
      metadata.cacheControl !== 'private,no-store,max-age=0'
    ) {
      await file.setMetadata(
        {
          cacheControl: 'private,no-store,max-age=0',
          metadata: {
            firebaseStorageDownloadTokens: null,
            ...(localEmulator ? { postMediaTokenRotated: 'true' } : {}),
          },
        },
        {
          ifMetagenerationMatch: metadata.metageneration,
        },
      );
    }
  } catch (error) {
    if ((error as { code?: number }).code !== 404) throw error;
  }
}

export const onPostMediaFinalized = functions
  .runWith({ failurePolicy: true })
  .storage.object()
  .onFinalize((object) => stripPostMediaDownloadToken(object.name, object.bucket));
export const onPostMediaMetadataUpdated = functions
  .runWith({ failurePolicy: true })
  .storage.object()
  .onMetadataUpdate((object) => stripPostMediaDownloadToken(object.name, object.bucket));
