import { randomUUID } from 'node:crypto';
import {
  FieldPath,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v1/https';
import { COLLECTIONS, SERVER_COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';
import {
  isPostReadId,
  PostReadAccess,
  serializeReadableComment,
  serializeReadablePost,
} from './postReadAccess';

const MAX_PAGE = 50;
const CURSOR_TTL_MS = 30 * 60 * 1000;
type View =
  | 'feed'
  | 'author'
  | 'group'
  | 'category'
  | 'comments'
  | 'ids'
  | 'saved'
  | 'groupSummary';
const VIEWS: View[] = [
  'feed',
  'author',
  'group',
  'category',
  'comments',
  'ids',
  'saved',
  'groupSummary',
];

function invalid(): never {
  throw new HttpsError('invalid-argument', 'La consulta no es válida. Actualiza la lista.');
}

/** Bounded scans and server-held cursors never disclose the IDs/dates of hidden rows. */
export async function readPostsForViewer(db: Firestore, uid: string | null, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  if (uid !== null && !isPostReadId(uid)) invalid();
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['view', 'id', 'ids', 'limit', 'cursor'].includes(key)))
    invalid();
  const view = data.view as View;
  if (!VIEWS.includes(view)) invalid();
  const limit = data.limit ?? 12;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE)
    invalid();
  const needsId = ['author', 'group', 'category', 'comments', 'groupSummary'].includes(view);
  if (needsId && !isPostReadId(data.id)) invalid();
  const id = needsId ? (data.id as string) : null;
  if (!needsId && data.id != null) invalid();
  if (view !== 'ids' && data.ids != null) invalid();
  const access = new PostReadAccess(db, uid);
  const noResults = { items: [], cursor: null, hasMore: false };
  if (view === 'saved' && !uid)
    throw new HttpsError('unauthenticated', 'Inicia sesión para ver tus guardados.');

  if (view === 'ids') {
    if (
      !Array.isArray(data.ids) ||
      data.ids.length < 1 ||
      data.ids.length > MAX_PAGE ||
      !data.ids.every(isPostReadId) ||
      data.cursor != null
    )
      invalid();
    const ids = [...new Set(data.ids as string[])];
    const posts = await db.getAll(
      ...ids.map((postId) => db.collection(COLLECTIONS.posts).doc(postId)),
    );
    const readable = await Promise.all(
      posts.map(async (post) => {
        const fields = post.data();
        return fields && (await access.post(fields))
          ? serializeReadablePost(post.id, fields)
          : null;
      }),
    );
    return { ...noResults, items: readable.filter((post) => post !== null) };
  }

  if (view === 'comments') {
    const parent = await access.get(`${COLLECTIONS.posts}/${id}`);
    if (!parent.exists || !(await access.post(parent.data() ?? {}))) return noResults;
  }
  if ((view === 'group' || view === 'groupSummary') && !(await access.group(id))) {
    return view === 'groupSummary' ? { ...noResults, weeklyPosts: 0 } : noResults;
  }

  if (view === 'groupSummary') {
    if (data.cursor != null) invalid();
    const posts = await db
      .collection(COLLECTIONS.posts)
      .where('groupId', '==', id)
      .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    let weeklyPosts = 0;
    for (let offset = 0; offset < posts.docs.length; offset += 10) {
      const visible = await Promise.all(
        posts.docs.slice(offset, offset + 10).map((post) => access.post(post.data())),
      );
      weeklyPosts += visible.filter(Boolean).length;
    }
    return { ...noResults, weeklyPosts };
  }

  const scope = JSON.stringify([uid, view, id, limit]);
  let position: { time: Timestamp; id: string } | null = null;
  if (data.cursor != null) {
    if (typeof data.cursor !== 'string' || !/^[a-f0-9]{32}$/.test(data.cursor)) invalid();
    const cursor = (
      await db.collection(SERVER_COLLECTIONS.postReadCursors).doc(data.cursor).get()
    ).data();
    if (
      !cursor ||
      cursor.scope !== scope ||
      !(cursor.expiresAt instanceof Timestamp) ||
      cursor.expiresAt.toMillis() <= Date.now() ||
      !(cursor.time instanceof Timestamp) ||
      !isPostReadId(cursor.id)
    )
      invalid();
    position = { time: cursor.time, id: cursor.id };
  }

  let query: Query<DocumentData> = db.collection(COLLECTIONS.posts);
  if (view === 'comments')
    query = db.collection(COLLECTIONS.posts).doc(id!).collection(SUBCOLLECTIONS.comments);
  if (view === 'saved')
    query = db.collection(COLLECTIONS.users).doc(uid!).collection(SUBCOLLECTIONS.savedPosts);
  if (view === 'group') query = query.where('groupId', '==', id);
  if (view === 'author') query = query.where('authorId', '==', id);
  if (view === 'category') query = query.where('categoryId', '==', id);
  query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (position) query = query.startAfter(position.time, position.id);
  const scanLimit = view === 'saved' ? limit + 1 : Math.max(30, limit * 3);
  const snapshot = await query.limit(scanLimit).get();
  const items: Array<
    ReturnType<typeof serializeReadablePost> | ReturnType<typeof serializeReadableComment>
  > = [];
  let consumed = 0;
  scan: for (let offset = 0; offset < snapshot.docs.length; offset += 10) {
    const rows = await Promise.all(
      snapshot.docs.slice(offset, offset + 10).map(async (document) => {
        const fields = document.data();
        if (view === 'comments') {
          return isPostReadId(fields.authorId) && !(await access.blocked(fields.authorId))
            ? serializeReadableComment(document.id, id!, fields)
            : null;
        }
        if (view === 'saved') {
          const saved = await access.get(`${COLLECTIONS.posts}/${document.id}`);
          return saved.exists && (await access.post(saved.data() ?? {}))
            ? serializeReadablePost(saved.id, saved.data()!)
            : null;
        }
        return (await access.post(fields)) ? serializeReadablePost(document.id, fields) : null;
      }),
    );
    for (const row of rows) {
      consumed++;
      if (row) items.push(row);
      if (items.length === limit || (view === 'saved' && consumed === limit)) break scan;
    }
  }
  const hasMore =
    view === 'saved'
      ? snapshot.docs.length > limit
      : consumed < snapshot.docs.length || snapshot.docs.length === scanLimit;
  let cursor: string | null = null;
  const last = snapshot.docs[consumed - 1];
  if (hasMore && last) {
    const time = last.get('createdAt');
    if (!(time instanceof Timestamp))
      throw new HttpsError('internal', 'No se pudo preparar la página.');
    cursor = randomUUID().replace(/-/g, '');
    await db
      .collection(SERVER_COLLECTIONS.postReadCursors)
      .doc(cursor)
      .create({
        scope,
        time,
        id: last.id,
        expiresAt: Timestamp.fromMillis(Date.now() + CURSOR_TTL_MS),
      });
  }
  return { items, cursor, hasMore };
}
