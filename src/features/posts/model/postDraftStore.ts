import type { CreatePostUploadingInput } from '@/shared/lib/firestore-post-upload';
import type { PostMediaUploadItem } from '@/shared/lib/storage';
import { createPostUploadingInputSchema } from '@/features/posts/api/types';
import { validatePostFile } from '@/shared/lib/post-media';
import { parseYouTubeUrl } from '@/shared/lib/youtube';

export type PostDraftScope = { uid: string; groupId: string | null; categoryId: string | null };
export type PostDraft = {
  title: string;
  text: string;
  youtubeUrl: string;
  files: Array<PostMediaUploadItem & { previewUrl?: string }>;
  pending?: { key: string; input: CreatePostUploadingInput };
};
export type DraftRecord = { revision: string | null; draft: PostDraft | null };
export interface PostDraftStore {
  load(scope: PostDraftScope): Promise<DraftRecord>;
  save(scope: PostDraftScope, draft: PostDraft | null, expected: string | null): Promise<string>;
}
export const postDraftScopeKey = (scope: PostDraftScope) =>
  JSON.stringify([scope.uid, scope.groupId, scope.categoryId]);
export const emptyPostDraft = (): PostDraft => ({ title: '', text: '', youtubeUrl: '', files: [] });
export const hasPostDraft = (draft: PostDraft) =>
  !!(draft.title || draft.text || draft.youtubeUrl || draft.files.length || draft.pending);
export const postDraftAttemptKey = (scope: PostDraftScope, draft: PostDraft) =>
  JSON.stringify([
    scope.uid,
    scope.groupId,
    scope.categoryId,
    draft.title.trim(),
    draft.text.trim(),
    parseYouTubeUrl(draft.youtubeUrl.trim())?.videoId,
    draft.files.map((file) => file.id),
  ]);
const conflict = () =>
  new Error('El borrador cambió en otra ventana. Conserva tus cambios y vuelve a abrir el editor.');
let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('No se pudo abrir el guardado de borradores.'));
      return;
    }
    const request = indexedDB.open('vinctus-post-drafts-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts');
      request.result.createObjectStore('files').createIndex('scope', 'scope');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('Cierra las otras ventanas de Vinctus y reintenta.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = undefined;
      };
      resolve(request.result);
    };
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}
const value = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const finished = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error('No se pudo guardar el borrador.'));
  });
type FileReference = {
  id: string;
  kind: PostMediaUploadItem['kind'];
  name: string;
  type: string;
  modified: number;
};
type StoredDraft = Omit<PostDraft, 'files'> & { files: FileReference[] };
type StoredRecord = { version: 1; scope: string; revision: string; draft: StoredDraft | null };
type StoredFile = { scope: string; blob: Blob };

export const browserPostDraftStore: PostDraftStore = {
  async load(scope) {
    const db = await database();
    const key = postDraftScopeKey(scope);
    const tx = db.transaction(['drafts', 'files'], 'readonly');
    const done = finished(tx);
    try {
      const record = (await value(tx.objectStore('drafts').get(key))) as StoredRecord | undefined;
      if (!record) {
        await done;
        return { revision: null, draft: null };
      }
      if (record.version !== 1 || record.scope !== key || typeof record.revision !== 'string')
        throw new Error('No se pudo recuperar este borrador.');
      if (!record.draft) {
        await done;
        return { revision: record.revision, draft: null };
      }
      const draft = record.draft;
      if (
        typeof draft.title !== 'string' ||
        draft.title.length > 4096 ||
        typeof draft.text !== 'string' ||
        draft.text.length > 100000 ||
        typeof draft.youtubeUrl !== 'string' ||
        draft.youtubeUrl.length > 8192 ||
        !Array.isArray(draft.files) ||
        draft.files.length > 10 ||
        new Set(draft.files.map((ref) => ref?.id)).size !== draft.files.length
      )
        throw new Error('El borrador guardado no es válido.');
      const files = await Promise.all(
        draft.files.map(async (ref) => {
          if (
            !ref ||
            typeof ref.id !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,100}$/.test(ref.id) ||
            !['image', 'video', 'file'].includes(ref.kind) ||
            typeof ref.name !== 'string'
          )
            throw new Error('No se pudo recuperar un adjunto.');
          const stored = (await value(
            tx.objectStore('files').get(JSON.stringify([key, ref.id])),
          )) as StoredFile | undefined;
          if (!stored || stored.scope !== key || !(stored.blob instanceof Blob))
            throw new Error('Falta un adjunto del borrador.');
          const file = new File([stored.blob], ref.name, {
            type: ref.type,
            lastModified: ref.modified,
          });
          validatePostFile(file, ref.kind);
          return { id: ref.id, kind: ref.kind, file };
        }),
      );
      await done;
      if (draft.pending) {
        const parsed = createPostUploadingInputSchema.safeParse(draft.pending.input);
        if (
          !parsed.success ||
          parsed.data.authorId !== scope.uid ||
          (parsed.data.groupId ?? null) !== scope.groupId ||
          (parsed.data.categoryId ?? null) !== scope.categoryId ||
          typeof draft.pending.key !== 'string'
        )
          throw new Error('El envío guardado no corresponde a esta cuenta.');
      }
      return { revision: record.revision, draft: { ...draft, files } };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already complete */
      }
      await done.catch(() => {});
      throw error;
    }
  },
  async save(scope, draft, expected) {
    if (!scope.uid) throw new Error('Inicia sesión para guardar un borrador.');
    const db = await database();
    const key = postDraftScopeKey(scope);
    const tx = db.transaction(['drafts', 'files'], 'readwrite');
    const done = finished(tx);
    // A tombstone retains the revision after publish/discard, so a late editor
    // cannot resurrect a cleared draft or publish the same attempt under a new ID.
    try {
      const records = tx.objectStore('drafts');
      const blobs = tx.objectStore('files');
      const current = (await value(records.get(key))) as StoredRecord | undefined;
      if ((current?.revision ?? null) !== expected) {
        tx.abort();
        await done.catch(() => {});
        throw conflict();
      }
      const existing = await value(blobs.index('scope').getAllKeys(key));
      const keep = new Set<IDBValidKey>();
      const refs: FileReference[] = [];
      for (const item of draft?.files ?? []) {
        const fileKey = JSON.stringify([key, item.id]);
        keep.add(fileKey);
        if (!existing.includes(fileKey))
          blobs.put({ scope: key, blob: item.file } satisfies StoredFile, fileKey);
        refs.push({
          id: item.id,
          kind: item.kind,
          name: item.file.name,
          type: item.file.type,
          modified: item.file.lastModified,
        });
      }
      for (const fileKey of existing) if (!keep.has(fileKey)) blobs.delete(fileKey);
      const revision = crypto.randomUUID();
      records.put(
        {
          version: 1,
          scope: key,
          revision,
          draft: draft ? { ...draft, files: refs } : null,
        } satisfies StoredRecord,
        key,
      );
      await done;
      return revision;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already complete/aborted */
      }
      await done.catch(() => {});
      throw error;
    }
  },
};

/** Serializes writes per editor; the database's compare-and-set handles other tabs. */
export class PostDraftSession {
  private revision: string | null = null;
  private ready = false;
  private queue: Promise<unknown> = Promise.resolve();
  private error: Error | null = null;
  constructor(
    readonly scope: PostDraftScope,
    private store: PostDraftStore = browserPostDraftStore,
  ) {}
  async load() {
    const record = await this.store.load(this.scope);
    this.revision = record.revision;
    this.ready = true;
    this.error = null;
    return record.draft;
  }
  save(draft: PostDraft | null, retry = false): Promise<void> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.ready) throw new Error('Espera a recuperar el borrador.');
        if (this.error && !retry) throw this.error;
        try {
          this.revision = await this.store.save(this.scope, draft, this.revision);
          this.error = null;
        } catch (error) {
          this.error =
            error instanceof Error ? error : new Error('No se pudo guardar el borrador.');
          throw this.error;
        }
      });
    this.queue = task;
    return task;
  }
}
