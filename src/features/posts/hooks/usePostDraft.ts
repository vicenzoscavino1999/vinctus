import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyPostDraft,
  hasPostDraft,
  postDraftAttemptKey,
  postDraftScopeKey,
  PostDraftSession,
  type PostDraft,
  type PostDraftScope,
} from '@/features/posts/model/postDraftStore';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo guardar el borrador en este dispositivo.';
const revoke = (files: PostDraft['files']) =>
  files.forEach((file) => {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
  });

export function usePostDraft(scope: PostDraftScope) {
  const key = postDraftScopeKey(scope);
  const { uid, groupId, categoryId } = scope;
  const session = useMemo(
    () => new PostDraftSession({ uid, groupId, categoryId }),
    [uid, groupId, categoryId],
  );
  const [draft, setDraft] = useState<PostDraft>(emptyPostDraft);
  const current = useRef<PostDraft>(emptyPostDraft());
  const [loaded, setLoaded] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const flush = useCallback(
    async (retry = false) => {
      stopTimer();
      if (!loadedRef.current) throw new Error('Espera a recuperar el borrador.');
      if (!dirtyRef.current && !retry) return;
      const captured = version.current;
      const snapshot = current.current;
      if (active.current) setSaving(true);
      try {
        await session.save(hasPostDraft(snapshot) ? snapshot : null, retry);
        if (version.current === captured) {
          dirtyRef.current = false;
          if (active.current) setDirty(false);
        }
        if (active.current) setError(null);
      } catch (error) {
        if (active.current) setError(errorText(error));
        throw error;
      } finally {
        if (active.current) setSaving(false);
      }
    },
    [session, stopTimer],
  );
  const install = (next: PostDraft) => {
    current.current = next;
    version.current++;
    dirtyRef.current = true;
    if (active.current) {
      setDraft(next);
      setDirty(true);
    }
    stopTimer();
    if (active.current)
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 150);
  };
  const edit = (patch: Partial<PostDraft>) => {
    const next = { ...current.current, ...patch };
    if (next.pending?.key !== postDraftAttemptKey(scope, next)) delete next.pending;
    install(next);
  };
  const restore = async () => {
    const restored = await session.load();
    if (!active.current) return;
    const next = restored ?? emptyPostDraft();
    next.files = next.files.map((file) => ({
      ...file,
      ...(file.kind !== 'file' ? { previewUrl: URL.createObjectURL(file.file) } : {}),
    }));
    revoke(current.current.files);
    current.current = next;
    loadedRef.current = true;
    setDraft(next);
    setLoaded(key);
    setError(null);
    dirtyRef.current = false;
    setDirty(false);
  };
  useEffect(() => {
    active.current = true;
    loadedRef.current = false;
    let cancelled = false;
    void session
      .load()
      .then((restored) => {
        if (cancelled) return;
        const next = restored ?? emptyPostDraft();
        next.files = next.files.map((file) => ({
          ...file,
          ...(file.kind !== 'file' ? { previewUrl: URL.createObjectURL(file.file) } : {}),
        }));
        current.current = next;
        loadedRef.current = true;
        setDraft(next);
        setLoaded(key);
        setError(null);
      })
      .catch((error) => {
        if (!cancelled) setError(errorText(error));
      });
    return () => {
      cancelled = true;
      active.current = false;
      stopTimer();
      // Capture before releasing UI previews. File objects stay alive through the queued write.
      if (loadedRef.current && dirtyRef.current) void flush().catch(() => {});
      revoke(current.current.files);
    };
  }, [session, key, flush, stopTimer]);
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, []);

  return {
    draft,
    peek: () => current.current,
    edit,
    restoring: loaded !== key,
    saving: saving || dirty,
    error,
    flush,
    retry: () => (loadedRef.current ? flush(true) : restore()),
    discard: async () => {
      const old = current.current;
      install(emptyPostDraft());
      const clearedVersion = version.current;
      try {
        await flush(true);
        revoke(old.files);
      } catch (error) {
        if (version.current === clearedVersion) {
          current.current = old;
          if (active.current) setDraft(old);
        }
        throw error;
      }
    },
    complete: async (attemptKey: string) => {
      const next = current.current;
      if (postDraftAttemptKey(scope, next) === attemptKey) {
        const old = next.files;
        install(emptyPostDraft());
        try {
          await flush();
        } finally {
          revoke(old);
        }
      } else {
        edit({ pending: undefined });
        await flush();
      }
    },
  };
}
