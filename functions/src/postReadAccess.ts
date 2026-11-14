import { type DocumentData, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';

export const isPostReadId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  !value.includes('/') &&
  !hasControlCharacters(value) &&
  value !== '.' &&
  value !== '..';

const hasControlCharacters = (value: string) => [...value].some((char) => char.charCodeAt(0) < 32);

export const isPublishedPost = (data: DocumentData): boolean =>
  data.status == null || data.status === 'ready';

/** One cache per request, never shared across users or later permission changes. */
export class PostReadAccess {
  private documents = new Map<string, Promise<DocumentSnapshot>>();

  constructor(
    private db: Firestore,
    readonly uid: string | null,
  ) {}

  get(path: string): Promise<DocumentSnapshot> {
    let pending = this.documents.get(path);
    if (!pending) {
      pending = this.db.doc(path).get();
      this.documents.set(path, pending);
    }
    return pending;
  }

  async blocked(authorId: string): Promise<boolean> {
    if (!this.uid || this.uid === authorId) return false;
    const paths = [
      `${COLLECTIONS.users}/${this.uid}/${SUBCOLLECTIONS.blockedUsers}/${authorId}`,
      `${COLLECTIONS.users}/${authorId}/${SUBCOLLECTIONS.blockedUsers}/${this.uid}`,
    ];
    return (await Promise.all(paths.map((path) => this.get(path)))).some((doc) => doc.exists);
  }

  async group(groupId: unknown): Promise<boolean> {
    if (!this.uid) return false;
    if (groupId == null) return true;
    if (!isPostReadId(groupId)) return false;
    const group = await this.get(`${COLLECTIONS.groups}/${groupId}`);
    if (!group.exists) return false;
    const data = group.data() ?? {};
    if (data.visibility === 'public') return true;
    if (!this.uid) return false;
    if (!(await this.get(`${COLLECTIONS.usersPublic}/${this.uid}`)).exists) return false;
    if (data.ownerId === this.uid) return true;
    return (
      await this.get(`${COLLECTIONS.groups}/${groupId}/${SUBCOLLECTIONS.members}/${this.uid}`)
    ).exists;
  }

  async post(data: DocumentData): Promise<boolean> {
    if (!this.uid) return false;
    if (!isPublishedPost(data) || !isPostReadId(data.authorId)) return false;
    if (!(await this.group(data.groupId)) || (await this.blocked(data.authorId))) return false;
    const profile = await this.get(`${COLLECTIONS.usersPublic}/${data.authorId}`);
    // Missing/deleted author profiles never silently become public accounts.
    if (!profile.exists) return false;
    if (profile.data()?.accountVisibility !== 'private' || this.uid === data.authorId) return true;
    return (
      this.uid != null &&
      (await this.get(`${COLLECTIONS.usersPublic}/${this.uid}`)).exists &&
      (
        await this.get(
          `${COLLECTIONS.users}/${data.authorId}/${SUBCOLLECTIONS.followers}/${this.uid}`,
        )
      ).exists
    );
  }
}

/** Only Storage paths belonging to this author/post can be served by the media endpoint. */
export function postMediaPath(path: unknown, authorId: string, postId: string): path is string {
  if (typeof path !== 'string' || path.length > 300) return false;
  const prefix = `posts/${authorId}/${postId}/`;
  if (!path.startsWith(prefix)) return false;
  return (
    !hasControlCharacters(path) && /^(images|videos|files)\/[^/]+$/.test(path.slice(prefix.length))
  );
}

function youtubeURL(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(
        url.hostname,
      )
    ) {
      id =
        url.pathname === '/watch'
          ? url.searchParams.get('v')
          : (url.pathname.match(/^\/embed\/([^/]+)$/)?.[1] ?? null);
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const wireTime = (value: unknown) => {
  const time = value as { seconds?: unknown; nanoseconds?: unknown } | null;
  return time && typeof time.seconds === 'number' && typeof time.nanoseconds === 'number'
    ? { seconds: time.seconds, nanoseconds: time.nanoseconds }
    : null;
};

export function serializeReadablePost(id: string, data: DocumentData) {
  const media = (Array.isArray(data.media) ? data.media : []).slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const embedded = entry.type === 'video' ? youtubeURL(entry.url) : null;
    if (!embedded && !postMediaPath(entry.path, data.authorId, id)) return [];
    if (!['image', 'video', 'file'].includes(entry.type)) return [];
    return [
      {
        type: entry.type,
        path: typeof entry.path === 'string' ? entry.path : '',
        // No persisted download token or arbitrary remote URL reaches readers.
        url: embedded ?? `post-media:${entry.path}`,
        contentType: text(entry.contentType, 120),
        fileName: text(entry.fileName, 120),
        size: count(entry.size),
        width: count(entry.width),
        height: count(entry.height),
      },
    ];
  });
  return {
    id,
    postId: id,
    authorId: data.authorId,
    authorSnapshot: {
      displayName: text(data.authorSnapshot?.displayName || data.authorName, 120) || 'Usuario',
      photoURL: text(data.authorSnapshot?.photoURL || data.authorPhoto, 500) || null,
    },
    authorName: text(data.authorSnapshot?.displayName || data.authorName, 120) || 'Usuario',
    authorUsername: text(data.authorUsername, 120),
    authorPhoto: text(data.authorSnapshot?.photoURL || data.authorPhoto, 500) || null,
    title: text(data.title, 120) || null,
    text: text(data.text ?? data.content, 5000),
    content: text(data.content ?? data.text, 5000),
    status: 'ready',
    media,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    likeCount: count(data.likeCount ?? data.likesCount),
    commentCount: count(data.commentCount ?? data.commentsCount),
    createdAt: wireTime(data.createdAt),
    updatedAt: wireTime(data.updatedAt),
  };
}

export function serializeReadableComment(id: string, postId: string, data: DocumentData) {
  return {
    id,
    postId,
    authorId: text(data.authorId, 200),
    authorSnapshot: {
      displayName: text(data.authorSnapshot?.displayName, 120) || 'Usuario',
      photoURL: text(data.authorSnapshot?.photoURL, 500) || null,
    },
    text: text(data.text, 1000),
    createdAt: wireTime(data.createdAt),
  };
}
