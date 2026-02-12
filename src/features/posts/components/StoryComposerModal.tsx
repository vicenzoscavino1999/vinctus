import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Film, Image as ImageIcon, Upload, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { createStory, getNewStoryId, type StoryMediaType } from '@/features/posts/api';
import { uploadStoryImage, uploadStoryVideo } from '@/shared/lib/storage';
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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

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

const StoryComposerModal = ({ isOpen, onClose, onCreated }: StoryComposerModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const revokePreview = (nextDraft: StoryDraft | null) => {
    if (nextDraft?.previewUrl && nextDraft.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(nextDraft.previewUrl);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      revokePreview(draft);
      setDraft(null);
      setIsUploading(false);
      setProgress(0);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, draft]);

  if (!isOpen) return null;

  const setDraftSafe = (next: StoryDraft | null) => {
    revokePreview(draft);
    setDraft(next);
  };

  const prepareImage = async (file: File): Promise<StoryDraft | null> => {
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('La imagen supera el limite de 10MB.', 'error');
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

      if (compressedFile.size > MAX_IMAGE_BYTES) {
        showToast('La imagen supera el limite de 10MB despues de comprimir.', 'error');
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
    if (file.size > MAX_VIDEO_BYTES) {
      showToast('El video supera el limite de 25MB.', 'error');
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
    const prepared = await prepareImage(file);
    if (prepared) setDraftSafe(prepared);
  };

  const handleVideoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
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

    setIsUploading(true);
    setProgress(0);

    try {
      const storyId = getNewStoryId();

      if (draft.type === 'image') {
        const result = await uploadStoryImage(
          draft.file,
          draft.thumbFile ?? null,
          user.uid,
          storyId,
          (progressValue) => {
            const pct =
              progressValue.totalBytes > 0
                ? Math.round((progressValue.bytesTransferred / progressValue.totalBytes) * 100)
                : 0;
            setProgress(pct);
          },
        );

        await createStory({
          storyId,
          ownerId: user.uid,
          ownerName: user.displayName ?? null,
          ownerPhoto: user.photoURL ?? null,
          mediaType: 'image',
          mediaUrl: result.url,
          mediaPath: result.path,
          thumbUrl: result.thumbUrl,
          thumbPath: result.thumbPath,
        });
      } else {
        const result = await uploadStoryVideo(draft.file, user.uid, storyId, (progressValue) => {
          const pct =
            progressValue.totalBytes > 0
              ? Math.round((progressValue.bytesTransferred / progressValue.totalBytes) * 100)
              : 0;
          setProgress(pct);
        });

        await createStory({
          storyId,
          ownerId: user.uid,
          ownerName: user.displayName ?? null,
          ownerPhoto: user.photoURL ?? null,
          mediaType: 'video',
          mediaUrl: result.url,
          mediaPath: result.path,
          thumbUrl: null,
          thumbPath: null,
        });
      }

      showToast('Historia publicada', 'success');
      setDraftSafe(null);
      onClose();
      onCreated?.();
    } catch (error) {
      console.error('Story upload failed:', error);
      showToast('No se pudo publicar la historia.', 'error');
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const content = (
    <div className="fixed inset-0 z-50 flex items-end justify-center safe-area-inset">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl bg-[#121212] border border-neutral-800 rounded-t-3xl px-6 pt-4 pb-8 max-h-[85vh] overflow-y-auto animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Nueva historia</h2>
            <p className="text-xs text-neutral-500">Comparte algo que dure 24 horas</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
            >
              <ImageIcon size={18} className="text-amber-300" />
              <span className="text-sm">Subir foto</span>
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
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
            accept="video/*"
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
