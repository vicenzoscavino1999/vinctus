import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { createPostUploading, getNewPostId, updatePost } from '@/features/posts/api';
import { notifyFeedCacheInvalidated } from '@/features/posts/model/feedCache';
import { compressToWebp, validateImage } from '@/shared/lib/compression';
import { parseYouTubeUrl } from '@/shared/lib/youtube';
import { fetchYouTubeVideoDetails, type YouTubeVideoDetails } from '@/shared/lib/youtubeApi';
import { deletePostAllMedia, uploadPostMedia } from '@/shared/lib/storage';

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
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

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

const revokePreviewUrls = (items: CreatePostAttachment[]) => {
  items.forEach((item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  });
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

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeDetails, setYoutubeDetails] = useState<YouTubeVideoDetails | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<CreatePostAttachment[]>([]);
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
  const latestAttachmentsRef = useRef<CreatePostAttachment[]>([]);

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
  const canSubmit = !isSubmitting && (!!text.trim() || !!title.trim() || !!youtubeUrl.trim());

  useEffect(() => {
    latestAttachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      revokePreviewUrls(latestAttachmentsRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setText('');
      setYoutubeUrl('');
      setYoutubeDetails(null);
      setYoutubeLoading(false);
      setYoutubeError(null);
      setError(null);
      setIsSubmitting(false);
      setProgress({ percent: 0, transferred: 0, total: 0 });
      setAttachments((prev) => {
        if (prev.length === 0) return prev;
        revokePreviewUrls(prev);
        return [];
      });
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
    if (usedMediaSlots >= MAX_ATTACHMENTS) {
      setError('Maximo 10 adjuntos por publicacion.');
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return;
    }
    setAttachments((prev) => [...prev, item]);
  };

  const handleImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
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

    try {
      for (const file of limited) {
        const compressedFile = await compressToWebp(file);
        addAttachment({
          id: buildAttachmentId(),
          kind: 'image',
          file: compressedFile,
          previewUrl: URL.createObjectURL(compressedFile),
        });
      }
    } catch (handleError) {
      setError(getErrorMessage(handleError, 'Error procesando imagenes.'));
    }
  };

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError(null);

    if (picked.length === 0) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - usedMediaSlots);
    const limited = picked.slice(0, remaining);

    for (const file of limited) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_VIDEO_TYPES.has(file.type) && !ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
        setError('Video no permitido. Usa MP4 o WebM.');
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setError('El video supera el limite de 100MB.');
        return;
      }
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
    setError(null);

    if (picked.length === 0) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - usedMediaSlots);
    const limited = picked.slice(0, remaining);

    for (const file of limited) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_FILE_TYPES.has(file.type) && !ALLOWED_FILE_EXTENSIONS.has(extension)) {
        setError('Archivo no permitido. Usa PDF, Word, Excel o PowerPoint.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError('El archivo supera el limite de 25MB.');
        return;
      }
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
    setAttachments((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSubmit = async () => {
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

    if (!trimmedText && !trimmedTitle && !parsedYouTube) {
      setError('Escribe un titulo o una descripcion antes de publicar.');
      return;
    }

    const autoTitle =
      trimmedTitle ||
      (youtubeDetails?.title?.trim() ? youtubeDetails.title.trim().slice(0, 120) : '');

    setIsSubmitting(true);
    setError(null);
    setProgress({ percent: 0, transferred: 0, total: 0 });

    const postId = getNewPostId();
    let created = false;
    let uploadedMedia: Awaited<ReturnType<typeof uploadPostMedia>> = [];

    try {
      await createPostUploading({
        postId,
        authorId: user.uid,
        authorSnapshot: {
          displayName: user.displayName || 'Usuario',
          photoURL: user.photoURL || null,
        },
        title: autoTitle ? autoTitle : null,
        text: trimmedText,
        groupId,
        categoryId,
      });
      created = true;

      if (attachments.length > 0) {
        uploadedMedia = await uploadPostMedia(
          attachments.map((item) => ({ kind: item.kind, file: item.file })),
          user.uid,
          postId,
          (total, transferred) => {
            const percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
            setProgress({ percent, transferred, total });
          },
        );
      }

      if (parsedYouTube) {
        uploadedMedia = [
          ...uploadedMedia,
          {
            url: parsedYouTube.embedUrl,
            path: `posts/${user.uid}/${postId}/videos/youtube-${parsedYouTube.videoId}`,
            type: 'video',
            contentType: 'video/youtube',
            fileName: `youtube-${parsedYouTube.videoId}.url`,
            size: 0,
          },
        ];
      }

      await updatePost(postId, {
        media: uploadedMedia,
        status: 'ready',
      });

      notifyFeedCacheInvalidated();
      onClose();
      onCreated?.(postId);
      if (redirectTo) {
        navigate(redirectTo);
      }
    } catch (submitError) {
      logCreatePostError('Error creating post:', submitError);
      setError(getErrorMessage(submitError, 'Error al publicar.'));
      if (created) {
        await updatePost(postId, { status: 'failed' }).catch(() => {});
      }
      if (uploadedMedia.length > 0) {
        await deletePostAllMedia(uploadedMedia.map((item) => item.path)).catch((cleanupError) => {
          logCreatePostError('Cleanup error:', cleanupError);
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    user,
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
