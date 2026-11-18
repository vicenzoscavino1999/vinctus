import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Film, Image as ImageIcon, Upload, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { createStory, getNewStoryId, type StoryMediaType } from '@/features/posts/api';
import { deleteStoryFiles, uploadStoryImage, uploadStoryVideo } from '@/shared/lib/storage';
import {
  LIMITS,
  STORAGE_CONTENT_TYPES,
  STORAGE_MAX_BYTES,
} from '@/shared/lib/firestore/firestoreContract';
import { loadHeic2Any } from '@/shared/lib/heic2any-loader';

type StoryDraft = {
  type: StoryMediaType;
  file: File;
  thumbFile?: File | null;
  previewUrl: string;
};

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// storage.rules take files smaller than these, so a file of exactly the limit is rejected too.
const MAX_IMAGE_BYTES = STORAGE_MAX_BYTES.image;
const MAX_VIDEO_BYTES = STORAGE_MAX_BYTES.storyVideo;
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

const isHeicFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
};

const replaceExtension = (name: string, next: string): string => {
  const base = name.replace(/\.[^/.]+$/, '');
  return `${base}.${next}`;
};

const normalizeStoryOwnerName = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LIMITS.stories.ownerNameMaxLength);
};

const normalizeStoryOwnerPhoto = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.stories.photoURLMaxLength) return null;
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') ? trimmed : null;
};

const StoryComposerModal = ({ isOpen, onClose, onCreated }: StoryComposerModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const draftRef = useRef<StoryDraft | null>(null);
  const isOpenRef = useRef(isOpen);
  const isUploadingRef = useRef(false);
  const isMountedRef = useRef(true);
  const activeUidRef = useRef<string | null>(user?.uid ?? null);
  const selectionSeqRef = useRef(0);

  const revokePreview = useCallback((nextDraft: StoryDraft | null) => {
    if (nextDraft?.previewUrl && nextDraft.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(nextDraft.previewUrl);
    }
  }, []);

  const setDraftSafe = useCallback(
    (next: StoryDraft | null) => {
      if (draftRef.current && draftRef.current !== next) {
        revokePreview(draftRef.current);
      }
      draftRef.current = next;
      setDraft(next);
    },
    [revokePreview],
  );

  const handleCloseAttempt = useCallback(() => {
    if (isUploadingRef.current) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      selectionSeqRef.current += 1;
      setDraftSafe(null);
      setIsUploading(false);
      isUploadingRef.current = false;
      setProgress(0);
    }
  }, [isOpen, setDraftSafe]);

  useEffect(() => {
    activeUidRef.current = user?.uid ?? null;
    selectionSeqRef.current += 1;
    setDraftSafe(null);
    setProgress(0);
  }, [user?.uid, setDraftSafe]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      revokePreview(draftRef.current);
      draftRef.current = null;
    },
    [revokePreview],
  );

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseAttempt();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, handleCloseAttempt]);

  if (!isOpen) return null;

  const prepareImage = async (file: File): Promise<StoryDraft | null> => {
    if (file.size >= MAX_IMAGE_BYTES) {
      showToast(`La imagen supera el limite de ${MAX_IMAGE_MB}MB.`, 'error');
      return null;
    }

    let sourceFile = file;
    if (isHeicFile(file)) {
      try {
        const heic2any = await loadHeic2Any();
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        sourceFile = new File([blob as Blob], replaceExtension(file.name, 'jpg'), {
          type: 'image/jpeg',
        });
      } catch (error) {
        console.error('HEIC conversion failed:', error);
        showToast('No se pudo convertir la imagen HEIC.', 'error');
        return null;
      }
    }

    try {
      const compressedBlob = await imageCompression(sourceFile, {
        maxSizeMB: 2,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        fileType: 'image/webp',
      });
      const compressedFile = new File([compressedBlob], replaceExtension(sourceFile.name, 'webp'), {
        type: 'image/webp',
      });

      if (compressedFile.size >= MAX_IMAGE_BYTES) {
        showToast(`La imagen supera el limite de ${MAX_IMAGE_MB}MB despues de comprimir.`, 'error');
        return null;
      }

      const thumbBlob = await imageCompression(compressedFile, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 480,
        useWebWorker: true,
        fileType: 'image/webp',
      });
      const thumbFile = new File([thumbBlob], replaceExtension(sourceFile.name, 'thumb.webp'), {
        type: 'image/webp',
      });

      return {
        type: 'image',
        file: compressedFile,
        thumbFile,
        previewUrl: URL.createObjectURL(compressedFile),
      };
    } catch (error) {
      console.error('Image compression failed:', error);
      showToast('No se pudo procesar la imagen.', 'error');
      return null;
    }
  };

  const prepareVideo = (file: File): StoryDraft | null => {
    if (file.type && !STORAGE_CONTENT_TYPES.video.includes(file.type)) {
      showToast('Formato de video no compatible. Usa MP4, WebM o MOV.', 'error');
      return null;
    }
    if (file.size >= MAX_VIDEO_BYTES) {
      showToast(`El video supera el limite de ${MAX_VIDEO_BYTES / (1024 * 1024)}MB.`, 'error');
      return null;
    }
    return {
      type: 'video',
      file,
      previewUrl: URL.createObjectURL(file),
    };
  };

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const seq = ++selectionSeqRef.current;
    const selectedUid = activeUidRef.current;
    const prepared = await prepareImage(file);
    if (!prepared) return;
    if (
      !isMountedRef.current ||
      !isOpenRef.current ||
      selectionSeqRef.current !== seq ||
      activeUidRef.current !== selectedUid
    ) {
      revokePreview(prepared);
      return;
    }
    setDraftSafe(prepared);
  };

  const handleVideoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    selectionSeqRef.current += 1;
    const prepared = prepareVideo(file);
    if (prepared) setDraftSafe(prepared);
  };

  const handlePublish = async () => {
    if (!user) {
      showToast('Inicia sesion para publicar.', 'warning');
      return;
    }
    if (!draft) {
      showToast('Selecciona una imagen o video.', 'warning');
      return;
    }
    if (isUploadingRef.current) return;

    const publishUid = user.uid;
    const ownerName = normalizeStoryOwnerName(user.displayName);
    const ownerPhoto = normalizeStoryOwnerPhoto(user.photoURL);
    isUploadingRef.current = true;
    setIsUploading(true);
    setProgress(0);

    const uploadedPaths: Array<string | null> = [];

    try {
      const storyId = getNewStoryId();

      if (draft.type === 'image') {
        const result = await uploadStoryImage(
          draft.file,
          draft.thumbFile ?? null,
          publishUid,
          storyId,
          (progressValue) => {
            if (!isMountedRef.current) return;
            const pct =
              progressValue.totalBytes > 0
                ? Math.round((progressValue.bytesTransferred / progressValue.totalBytes) * 100)
                : 0;
            setProgress(pct);
          },
        );
        uploadedPaths.push(result.path, result.thumbPath);

        await createStory({
          storyId,
          ownerId: publishUid,
          ownerName,
          ownerPhoto,
          mediaType: 'image',
          mediaUrl: result.url,
          mediaPath: result.path,
          thumbUrl: result.thumbUrl,
          thumbPath: result.thumbPath,
        });
      } else {
        const result = await uploadStoryVideo(draft.file, publishUid, storyId, (progressValue) => {
          if (!isMountedRef.current) return;
          const pct =
            progressValue.totalBytes > 0
              ? Math.round((progressValue.bytesTransferred / progressValue.totalBytes) * 100)
              : 0;
          setProgress(pct);
        });
        uploadedPaths.push(result.path);

        await createStory({
          storyId,
          ownerId: publishUid,
          ownerName,
          ownerPhoto,
          mediaType: 'video',
          mediaUrl: result.url,
          mediaPath: result.path,
          thumbUrl: null,
          thumbPath: null,
        });
      }

      if (!isMountedRef.current || activeUidRef.current !== publishUid) return;

      showToast('Historia publicada', 'success');
      setDraftSafe(null);
      onClose();
      onCreated?.();
    } catch (error) {
      await deleteStoryFiles(uploadedPaths).catch(() => undefined);
      console.error('Story upload failed:', error);
      if (isMountedRef.current) {
        showToast('No se pudo publicar la historia.', 'error');
      }
    } finally {
      isUploadingRef.current = false;
      if (isMountedRef.current) {
        setIsUploading(false);
        setProgress(0);
      }
    }
  };

  const content = (
    <div className="fixed inset-0 z-50 flex items-end justify-center safe-area-inset">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleCloseAttempt} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nueva historia"
        className="relative w-full max-w-2xl bg-[#121212] border border-neutral-800 rounded-t-3xl px-6 pt-4 pb-8 max-h-[85vh] overflow-y-auto animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Nueva historia</h2>
            <p className="text-xs text-neutral-500">Comparte algo que dure 24 horas</p>
          </div>
          <button
            onClick={handleCloseAttempt}
            disabled={isUploading}
            className="p-2 rounded-full hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <ImageIcon size={18} className="text-amber-300" />
              <span className="text-sm">Subir foto</span>
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <Film size={18} className="text-sky-300" />
              <span className="text-sm">Subir video</span>
            </button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={handleImageSelected}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleVideoSelected}
          />

          {draft ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
              <div className="text-xs uppercase tracking-widest text-neutral-500">
                {draft.type === 'image' ? 'Vista previa' : 'Vista previa de video'}
              </div>
              <div className="relative w-full h-64 rounded-2xl overflow-hidden bg-black/60 flex items-center justify-center">
                {draft.type === 'image' ? (
                  <img
                    src={draft.previewUrl}
                    alt="Vista previa"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video src={draft.previewUrl} className="w-full h-full object-cover" controls />
                )}
              </div>
              {isUploading ? (
                <div className="flex items-center gap-3 text-sm text-neutral-400">
                  <Upload size={16} className="text-amber-300" />
                  Subiendo... {progress}%
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Listo para publicar</span>
                  <button
                    onClick={() => setDraftSafe(null)}
                    className="text-amber-300 hover:text-amber-200 transition-colors"
                  >
                    Cambiar archivo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-neutral-500 py-10 border border-dashed border-neutral-800 rounded-2xl">
              Selecciona una foto o video para continuar.
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={!draft || isUploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Upload size={16} />
            {isUploading ? 'Publicando...' : 'Publicar historia'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

export default StoryComposerModal;
