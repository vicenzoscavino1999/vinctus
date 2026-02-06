import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Image as ImageIcon, Loader2, Film, FileText } from 'lucide-react';

import { useAuth } from '@/context';
import { getNewPostId } from '@/features/posts/api';
import { createPostUploading, updatePost } from '@/features/posts/api';
import { compressToWebp, validateImage } from '@/shared/lib/compression';
import { uploadPostMedia, deletePostAllMedia } from '@/shared/lib/storage';

type SelectedAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file';
  file: File;
  previewUrl?: string;
};

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string | null;
  categoryId?: string | null;
  redirectTo?: string | null;
  onCreated?: (postId: string) => void;
}

const MAX_ATTACHMENTS = 10;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const allowedVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const allowedFileTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const allowedFileExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const CreatePostModal = ({
  isOpen,
  onClose,
  groupId = null,
  categoryId = null,
  redirectTo = '/feed',
  onCreated,
}: CreatePostModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAttachmentSize = useMemo(
    () => attachments.reduce((sum, item) => sum + item.file.size, 0),
    [attachments],
  );

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setText('');
      setError(null);
      setIsSubmitting(false);
      setProgress({ percent: 0, transferred: 0, total: 0 });
      setAttachments((prev) => {
        if (prev.length === 0) return prev;
        prev.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        return [];
      });
    }
  }, [isOpen]);

  const canSubmit = !isSubmitting && (!!text.trim() || !!title.trim());

  const openImagePicker = () => imageInputRef.current?.click();
  const openVideoPicker = () => videoInputRef.current?.click();
  const openFilePicker = () => fileInputRef.current?.click();

  const buildAttachmentId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const addAttachment = (item: SelectedAttachment) => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      setError('Maximo 10 adjuntos por publicacion.');
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return;
    }
    setAttachments((prev) => [...prev, item]);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);

    if (!picked.length) return;

    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const limited = picked.slice(0, remaining);

    for (const f of limited) {
      const v = validateImage(f);
      if (!v.valid) {
        setError(v.error ?? 'Imagen invalida.');
        return;
      }
    }

    try {
      for (const f of limited) {
        const compressedFile = await compressToWebp(f);
        addAttachment({
          id: buildAttachmentId(),
          kind: 'image',
          file: compressedFile,
          previewUrl: URL.createObjectURL(compressedFile),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Error procesando imagenes');
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);

    if (!picked.length) return;

    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const limited = picked.slice(0, remaining);

    for (const f of limited) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!allowedVideoTypes.has(f.type) && !['mp4', 'webm', 'mov'].includes(ext)) {
        setError('Video no permitido. Usa MP4 o WebM.');
        return;
      }
      if (f.size > MAX_VIDEO_BYTES) {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);

    if (!picked.length) return;

    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const limited = picked.slice(0, remaining);

    for (const f of limited) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!allowedFileTypes.has(f.type) && !allowedFileExtensions.has(ext)) {
        setError('Archivo no permitido. Usa PDF, Word, Excel o PowerPoint.');
        return;
      }
      if (f.size > MAX_FILE_BYTES) {
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
      const updated = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!user) {
      setError('Debes iniciar sesion');
      return;
    }

    const trimmedText = text.trim();
    const trimmedTitle = title.trim();

    if (!trimmedText && !trimmedTitle) {
      setError('Escribe un titulo o una descripcion antes de publicar.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setProgress({ percent: 0, transferred: 0, total: 0 });

    const postId = getNewPostId();
    let created = false;
    let uploadedMedia: Array<{
      url: string;
      path: string;
      type: 'image' | 'video' | 'file';
      contentType?: string;
      fileName?: string;
      size?: number;
    }> = [];

    try {
      await createPostUploading({
        postId,
        authorId: user.uid,
        authorSnapshot: {
          displayName: user.displayName || 'Usuario',
          photoURL: user.photoURL || null,
        },
        title: trimmedTitle ? trimmedTitle : null,
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

        await updatePost(postId, {
          media: uploadedMedia,
          status: 'ready',
        });
      } else {
        await updatePost(postId, { status: 'ready' });
      }

      onClose();
      if (onCreated) {
        onCreated(postId);
      }
      if (redirectTo) {
        navigate(redirectTo);
      }
    } catch (err: any) {
      console.error('Error creating post:', err);
      setError(err.message || 'Error al publicar');

      if (created) {
        await updatePost(postId, { status: 'failed' }).catch(() => {});
      }
      if (uploadedMedia.length > 0) {
        await deletePostAllMedia(uploadedMedia.map((m) => m.path)).catch((cleanupErr) => {
          console.error('Cleanup error:', cleanupErr);
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const imageAttachments = attachments.filter((item) => item.kind === 'image');
  const videoAttachments = attachments.filter((item) => item.kind === 'video');
  const fileAttachments = attachments.filter((item) => item.kind === 'file');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium text-white">Crear Publicacion</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-3 mb-4">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Usuario'}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium text-lg">
                {(user?.displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-medium">{user?.displayName || 'Usuario'}</p>
              <p className="text-neutral-500 text-sm">{user?.email || ''}</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Titulo (opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Escribe un titulo breve"
              className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              maxLength={120}
              disabled={isSubmitting}
            />
            <div className="text-right text-xs text-neutral-600 mt-1">{title.length}/120</div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe la descripcion de tu publicacion"
            className="w-full h-32 bg-transparent text-white placeholder-neutral-500 resize-none focus:outline-none text-base leading-relaxed"
            maxLength={5000}
            autoFocus
            disabled={isSubmitting}
          />

          <div className="text-right text-neutral-500 text-sm">{text.length}/5000</div>

          {imageAttachments.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {imageAttachments.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.previewUrl}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  {!isSubmitting && (
                    <button
                      onClick={() => removeAttachment(img.id)}
                      className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {videoAttachments.length > 0 && (
            <div className="mt-4 space-y-2">
              {videoAttachments.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-neutral-300 text-sm">
                    <Film size={16} className="text-sky-300" />
                    <span className="truncate">{video.file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">{formatBytes(video.file.size)}</span>
                    {!isSubmitting && (
                      <button
                        onClick={() => removeAttachment(video.id)}
                        className="text-neutral-500 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {fileAttachments.length > 0 && (
            <div className="mt-4 space-y-2">
              {fileAttachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-neutral-300 text-sm">
                    <FileText size={16} className="text-emerald-300" />
                    <span className="truncate">{file.file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">{formatBytes(file.file.size)}</span>
                    {!isSubmitting && (
                      <button
                        onClick={() => removeAttachment(file.id)}
                        className="text-neutral-500 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {isSubmitting && progress.total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-neutral-400 mb-2">
                <span>Subiendo archivos...</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleVideoSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={openImagePicker}
              disabled={isSubmitting || attachments.length >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImageIcon size={20} />
              <span className="text-sm">Imagenes</span>
            </button>
            <button
              onClick={openVideoPicker}
              disabled={isSubmitting || attachments.length >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Film size={20} />
              <span className="text-sm">Videos</span>
            </button>
            <button
              onClick={openFilePicker}
              disabled={isSubmitting || attachments.length >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={20} />
              <span className="text-sm">Archivos</span>
            </button>
            {attachments.length > 0 && (
              <span className="text-xs text-neutral-500 w-full sm:w-auto">
                {attachments.length}/{MAX_ATTACHMENTS} - {formatBytes(totalAttachmentSize)}
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Publicando...
              </>
            ) : (
              'Publicar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePostModal;
