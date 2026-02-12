import { X, Image as ImageIcon, Loader2, Film, FileText, Link2 } from 'lucide-react';
import { useCreatePost } from '@/features/posts/hooks/useCreatePost';
import { formatBytes } from '@/shared/lib/formatUtils';
import { formatYouTubeDuration, formatYouTubeViews } from '@/shared/lib/youtubeApi';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string | null;
  categoryId?: string | null;
  redirectTo?: string | null;
  onCreated?: (postId: string) => void;
}

const MAX_ATTACHMENTS = 10;

const CreatePostModal = ({
  isOpen,
  onClose,
  groupId = null,
  categoryId = null,
  redirectTo = '/feed',
  onCreated,
}: CreatePostModalProps) => {
  const {
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
  } = useCreatePost({
    isOpen,
    onClose,
    groupId,
    categoryId,
    redirectTo,
    onCreated,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset bg-black/70 p-4">
      <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium text-white">Crear Publicacion</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Cerrar"
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
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Escribe un titulo breve"
              className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              maxLength={120}
              disabled={isSubmitting}
            />
            <div className="text-right text-xs text-neutral-600 mt-1">{title.length}/120</div>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Escribe la descripcion de tu publicacion"
            className="w-full h-32 bg-transparent text-white placeholder-neutral-500 resize-none focus:outline-none text-base leading-relaxed"
            maxLength={5000}
            autoFocus
            disabled={isSubmitting}
          />

          <div className="text-right text-neutral-500 text-sm">{text.length}/5000</div>

          <div className="mt-4">
            <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Link de YouTube (opcional)
            </label>
            <div className="relative">
              <Link2
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="url"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-neutral-900/40 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                disabled={isSubmitting}
              />
            </div>
            {youtubeUrl.trim() && (
              <p className={`mt-2 text-xs ${youtubeMeta ? 'text-emerald-400' : 'text-red-400'}`}>
                {youtubeMeta
                  ? 'Video de YouTube detectado correctamente.'
                  : 'Link invalido. Usa youtube.com o youtu.be.'}
              </p>
            )}
            {youtubeLoading && (
              <p className="mt-2 text-xs text-neutral-400">Consultando metadata de YouTube...</p>
            )}
            {youtubeError && !youtubeLoading && (
              <p className="mt-2 text-xs text-amber-300">{youtubeError}</p>
            )}
            {youtubeDetails && youtubeMeta && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  youtubeDetails.embeddable
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-200'
                }`}
              >
                <p className="font-medium text-sm text-white line-clamp-2">
                  {youtubeDetails.title || 'Video de YouTube'}
                </p>
                <p className="mt-1 text-neutral-300">
                  {youtubeDetails.channelTitle || 'Canal desconocido'}
                  {formatYouTubeDuration(youtubeDetails.durationIso)
                    ? ` - ${formatYouTubeDuration(youtubeDetails.durationIso)}`
                    : ''}
                  {formatYouTubeViews(youtubeDetails.viewCount)
                    ? ` - ${formatYouTubeViews(youtubeDetails.viewCount)} vistas`
                    : ''}
                </p>
                <p className="mt-1">
                  {youtubeDetails.embeddable
                    ? 'Listo para reproducirse dentro de Vinctus.'
                    : 'YouTube indica que este video no permite embed.'}
                </p>
              </div>
            )}
          </div>

          {imageAttachments.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {imageAttachments.map((imageAttachment) => (
                <div key={imageAttachment.id} className="relative group">
                  <img
                    src={imageAttachment.previewUrl}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  {!isSubmitting && (
                    <button
                      onClick={() => removeAttachment(imageAttachment.id)}
                      className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Eliminar imagen adjunta"
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
              {videoAttachments.map((videoAttachment) => (
                <div
                  key={videoAttachment.id}
                  className="flex items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-neutral-300 text-sm">
                    <Film size={16} className="text-sky-300" />
                    <span className="truncate">{videoAttachment.file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">
                      {formatBytes(videoAttachment.file.size)}
                    </span>
                    {!isSubmitting && (
                      <button
                        onClick={() => removeAttachment(videoAttachment.id)}
                        className="text-neutral-500 hover:text-white"
                        aria-label="Eliminar video adjunto"
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
              {fileAttachments.map((fileAttachment) => (
                <div
                  key={fileAttachment.id}
                  className="flex items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-neutral-300 text-sm">
                    <FileText size={16} className="text-emerald-300" />
                    <span className="truncate">{fileAttachment.file.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">
                      {formatBytes(fileAttachment.file.size)}
                    </span>
                    {!isSubmitting && (
                      <button
                        onClick={() => removeAttachment(fileAttachment.id)}
                        className="text-neutral-500 hover:text-white"
                        aria-label="Eliminar archivo adjunto"
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
              disabled={isSubmitting || usedMediaSlots >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImageIcon size={20} />
              <span className="text-sm">Imagenes</span>
            </button>
            <button
              onClick={openVideoPicker}
              disabled={isSubmitting || usedMediaSlots >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Film size={20} />
              <span className="text-sm">Videos</span>
            </button>
            <button
              onClick={openFilePicker}
              disabled={isSubmitting || usedMediaSlots >= MAX_ATTACHMENTS}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={20} />
              <span className="text-sm">Archivos</span>
            </button>
            {usedMediaSlots > 0 && (
              <span className="text-xs text-neutral-500 w-full sm:w-auto">
                {usedMediaSlots}/{MAX_ATTACHMENTS} - {formatBytes(totalAttachmentSize)}
                {youtubeMeta ? ' + 1 enlace YouTube' : ''}
              </span>
            )}
          </div>

          <button
            onClick={() => void handleSubmit()}
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
