import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { getNewPostId } from '@/features/posts/api';
import { usePostDraft } from './usePostDraft';
import { postDraftAttemptKey, hasPostDraft } from '@/features/posts/model/postDraftStore';
import { PostSubmission } from '@/features/posts/model/PostSubmission';
import { notifyFeedCacheInvalidated } from '@/features/posts/model/feedCache';
import { compressToWebp, validateImage } from '@/shared/lib/compression';
import { parseYouTubeUrl } from '@/shared/lib/youtube';
import { fetchYouTubeVideoDetails, type YouTubeVideoDetails } from '@/shared/lib/youtubeApi';
import { validatePostFile } from '@/shared/lib/post-media';
import { LIMITS, STORAGE_PATHS } from '@/shared/lib/firestore/firestoreContract';

export type CreatePostAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file';
  file: File;
  previewUrl?: string;
};

type CreatePostProgress = {
  percent: number;
  transferred: number;
  total: number;
};

type UseCreatePostOptions = {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string | null;
  categoryId?: string | null;
  redirectTo?: string | null;
  onCreated?: (postId: string) => void;
};

const MAX_ATTACHMENTS = 10;
const logCreatePostError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};

const buildAttachmentId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useCreatePost = ({
  isOpen,
  onClose,
  groupId = null,
  categoryId = null,
  redirectTo = '/feed',
  onCreated,
}: UseCreatePostOptions) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const scope = { uid: user?.uid ?? '', groupId, categoryId };
  const draftStore = usePostDraft(scope);
  const { title, text, youtubeUrl, files: attachments } = draftStore.draft;
  const setTitle = (title: string) => draftStore.edit({ title });
  const setText = (text: string) => draftStore.edit({ text });
  const setYoutubeUrl = (youtubeUrl: string) => draftStore.edit({ youtubeUrl });
  const [youtubeDetails, setYoutubeDetails] = useState<YouTubeVideoDetails | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CreatePostProgress>({
    percent: 0,
    transferred: 0,
    total: 0,
  });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ key: string; submission: PostSubmission } | null>(null);
  const confirmedId = useRef<string | null>(null);
  const sending = useRef(false);
  const alive = useRef(false);
  const epoch = useRef(0);
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const preparing = useRef(false);

  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (preparing.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, []);

  const youtubeMeta = useMemo(() => parseYouTubeUrl(youtubeUrl), [youtubeUrl]);
  const usedMediaSlots = attachments.length + (youtubeMeta ? 1 : 0);
  const totalAttachmentSize = useMemo(
    () => attachments.reduce((sum, item) => sum + item.file.size, 0),
    [attachments],
  );
  const imageAttachments = useMemo(
    () => attachments.filter((item) => item.kind === 'image'),
    [attachments],
  );
  const videoAttachments = useMemo(
    () => attachments.filter((item) => item.kind === 'video'),
    [attachments],
  );
  const fileAttachments = useMemo(
    () => attachments.filter((item) => item.kind === 'file'),
    [attachments],
  );
  const canSubmit =
    !isSubmitting &&
    !draftStore.restoring &&
    !draftStore.error &&
    !isPreparingMedia &&
    (!!confirmedId.current ||
      !!text.trim() ||
      !!title.trim() ||
      !!youtubeUrl.trim() ||
      attachments.length > 0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current += 1;
    };
  }, []);

  useEffect(() => {
    epoch.current += 1;
    if (!isOpen) {
      pending.current = null;
      sending.current = false;
      preparing.current = false;
      setIsPreparingMedia(false);
      setYoutubeDetails(null);
      setYoutubeLoading(false);
      setYoutubeError(null);
      setError(null);
      setIsSubmitting(false);
      setProgress({ percent: 0, transferred: 0, total: 0 });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!youtubeMeta) {
      setYoutubeDetails(null);
      setYoutubeLoading(false);
      setYoutubeError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setYoutubeLoading(true);
      setYoutubeError(null);
      try {
        const details = await fetchYouTubeVideoDetails(youtubeMeta.videoId, controller.signal);
        if (!active) return;
        setYoutubeDetails(details);
      } catch (loadError) {
        if (!active) return;
        if ((loadError as { name?: string }).name === 'AbortError') return;
        setYoutubeDetails(null);
        setYoutubeError(
          getErrorMessage(loadError, 'No se pudo consultar metadata de YouTube en este momento.'),
        );
      } finally {
        if (active) setYoutubeLoading(false);
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [youtubeMeta]);

  const openImagePicker = () => imageInputRef.current?.click();
  const openVideoPicker = () => videoInputRef.current?.click();
  const openFilePicker = () => fileInputRef.current?.click();

  const addAttachment = (item: CreatePostAttachment) => {
    if (draftStore.peek().files.length + (youtubeMeta ? 1 : 0) >= MAX_ATTACHMENTS) {
      setError('Maximo 10 adjuntos por publicacion.');
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return;
    }
    draftStore.edit({ files: [...draftStore.peek().files, item] });
  };

  const handleImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (sending.current || preparing.current) return;
    setError(null);

    if (picked.length === 0) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - usedMediaSlots);
    const limited = picked.slice(0, remaining);

    for (const file of limited) {
      const validation = validateImage(file);
      if (!validation.valid) {
        setError(validation.error ?? 'Imagen invalida.');
        return;
      }
    }

    const version = epoch.current;
    preparing.current = true;
    setIsPreparingMedia(true);
    try {
      for (const file of limited) {
        const compressedFile = await compressToWebp(file);
        if (!alive.current || epoch.current !== version) return;
        addAttachment({
          id: buildAttachmentId(),
          kind: 'image',
          file: compressedFile,
          previewUrl: URL.createObjectURL(compressedFile),
        });
      }
    } catch (handleError) {
      if (alive.current && epoch.current === version)
        setError(getErrorMessage(handleError, 'Error procesando imagenes.'));
    } finally {
      if (alive.current && epoch.current === version) {
        preparing.current = false;
        setIsPreparingMedia(false);
      }
    }
  };

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (sending.current || preparing.current) return;
    setError(null);

    if (picked.length === 0) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - usedMediaSlots);
    const limited = picked.slice(0, remaining);

    try {
      limited.forEach((file) => validatePostFile(file, 'video'));
    } catch (error) {
      setError(getErrorMessage(error, 'Video no permitido.'));
      return;
    }

    limited.forEach((file) => {
      addAttachment({
        id: buildAttachmentId(),
        kind: 'video',
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (sending.current || preparing.current) return;
    setError(null);

    if (picked.length === 0) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - usedMediaSlots);
    const limited = picked.slice(0, remaining);

    try {
      limited.forEach((file) => validatePostFile(file, 'file'));
    } catch (error) {
      setError(getErrorMessage(error, 'Archivo no permitido.'));
      return;
    }

    limited.forEach((file) => {
      addAttachment({
        id: buildAttachmentId(),
        kind: 'file',
        file,
      });
    });
  };

  const removeAttachment = (id: string) => {
    if (sending.current) return;
    const files = draftStore.peek().files;
    const removed = files.find((item) => item.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    draftStore.edit({ files: files.filter((item) => item.id !== id) });
  };

  const present = (publishedId: string) => {
    notifyFeedCacheInvalidated();
    onCreated?.(publishedId);
    if (hasPostDraft(draftStore.peek())) return;
    onClose();
    if (redirectTo) navigate(redirectTo);
  };
  const handleSubmit = async () => {
    if (sending.current || preparing.current || draftStore.restoring) return;
    if (confirmedId.current && !hasPostDraft(draftStore.peek())) {
      try {
        present(confirmedId.current);
      } catch {
        /* The confirmed post remains terminal. */
      }
      return;
    }
    const { title, text, youtubeUrl, files: attachments } = draftStore.peek();
    if (!user) {
      setError('Debes iniciar sesion');
      return;
    }

    const trimmedText = text.trim();
    const trimmedTitle = title.trim();
    const trimmedYouTubeUrl = youtubeUrl.trim();
    const parsedYouTube = trimmedYouTubeUrl ? parseYouTubeUrl(trimmedYouTubeUrl) : null;

    if (trimmedYouTubeUrl && !parsedYouTube) {
      setError('El link de YouTube no es valido.');
      return;
    }

    if (parsedYouTube && attachments.length >= MAX_ATTACHMENTS) {
      setError('Maximo 10 adjuntos por publicacion.');
      return;
    }

    if (parsedYouTube && youtubeDetails && !youtubeDetails.embeddable) {
      setError('Este video no permite reproduccion embebida en Vinctus.');
      return;
    }

    if (!trimmedText && !trimmedTitle && !parsedYouTube && attachments.length === 0) {
      setError('Escribe un titulo o una descripcion antes de publicar.');
      return;
    }

    const autoTitle =
      trimmedTitle ||
      (youtubeDetails?.title?.trim()
        ? youtubeDetails.title.trim().slice(0, LIMITS.posts.titleMaxLength)
        : parsedYouTube
          ? 'Video de YouTube'
          : attachments.length > 0 && !trimmedText
            ? 'Publicación'
            : '');

    sending.current = true;
    const version = epoch.current;
    const current = () => alive.current && epoch.current === version;
    setIsSubmitting(true);
    setError(null);
    setProgress({ percent: 0, transferred: 0, total: 0 });

    const key = postDraftAttemptKey(scope, draftStore.peek());
    try {
      if (pending.current?.key !== key) {
        const cached = draftStore.peek().pending;
        const postId = cached?.key === key ? cached.input.postId : getNewPostId();
        const input =
          cached?.key === key
            ? cached.input
            : {
                postId,
                authorId: user.uid,
                authorSnapshot: {
                  displayName: user.displayName || 'Usuario',
                  photoURL: user.photoURL || null,
                },
                title: autoTitle || null,
                text: trimmedText,
                groupId,
                categoryId,
              };
        draftStore.edit({ pending: { key, input } });
        pending.current = {
          key,
          submission: new PostSubmission(
            input,
            attachments.map((item) => ({ id: item.id, kind: item.kind, file: item.file })),
            parsedYouTube
              ? [
                  {
                    url: parsedYouTube.embedUrl,
                    path: STORAGE_PATHS.postVideo({
                      userId: user.uid,
                      postId,
                      filename: `youtube-${parsedYouTube.videoId}`,
                    }),
                    type: 'video',
                    contentType: 'video/youtube',
                    fileName: `youtube-${parsedYouTube.videoId}.url`,
                    size: 0,
                  },
                ]
              : [],
          ),
        };
      }
      if (draftStore.peek().pending?.key !== key) {
        draftStore.edit({ pending: { key, input: pending.current.submission.input } });
      }
      await draftStore.flush();
      if (!current()) return;
      const publishedId = await pending.current.submission.publish((total, transferred) => {
        if (current())
          setProgress({
            percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
            total,
            transferred,
          });
      });
      confirmedId.current = publishedId;
      try {
        await draftStore.complete(key);
      } catch {
        if (current())
          setError('La publicación se guardó, pero no se pudo actualizar el borrador local.');
        return;
      }
      if (!current()) return;
      // Presentation callbacks cannot roll back a confirmed post or delete its files.
      try {
        present(publishedId);
      } catch (error) {
        logCreatePostError('Post saved, screen update failed:', error);
        setError('La publicación ya se guardó, pero no se pudo actualizar la pantalla.');
      }
    } catch (error) {
      logCreatePostError('Error creating post:', error);
      if (current())
        setError(getErrorMessage(error, 'No se pudo confirmar la publicación. Puedes reintentar.'));
      return;
    } finally {
      if (current()) {
        sending.current = false;
        setIsSubmitting(false);
      }
    }
  };

  return {
    user,
    draftRestoring: draftStore.restoring,
    draftSaving: draftStore.saving,
    draftError: draftStore.error,
    retryDraftSave: draftStore.retry,
    discardDraft: async () => {
      if (!sending.current && !preparing.current && !draftStore.restoring) {
        await draftStore.discard();
        onClose();
      }
    },
    closeEditor: async () => {
      if (sending.current || preparing.current) return;
      if (draftStore.restoring) {
        if (draftStore.error) onClose();
        return;
      }
      try {
        await draftStore.flush();
      } catch (error) {
        if (
          !window.confirm(
            'No se pudieron guardar estos cambios. Cópialos antes de cerrar. ¿Cerrar sin guardar?',
          )
        )
          throw error;
      }
      onClose();
    },
    isPublished: !!confirmedId.current && !hasPostDraft(draftStore.peek()),
    title,
    setTitle,
    text,
    setText,
    youtubeUrl,
    setYoutubeUrl,
    youtubeMeta,
    youtubeDetails,
    youtubeLoading,
    youtubeError,
    attachments,
    imageAttachments,
    videoAttachments,
    fileAttachments,
    usedMediaSlots,
    totalAttachmentSize,
    isSubmitting,
    isPreparingMedia,
    error,
    progress,
    canSubmit,
    imageInputRef,
    videoInputRef,
    fileInputRef,
    openImagePicker,
    openVideoPicker,
    openFilePicker,
    handleImageSelect,
    handleVideoSelect,
    handleFileSelect,
    removeAttachment,
    handleSubmit,
  };
};
