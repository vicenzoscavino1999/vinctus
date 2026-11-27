import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Loader2, Film, FileText, Link2, Play } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useCreatePost } from '@/features/posts/hooks/useCreatePost';
import { useGroupName } from '@/features/posts/hooks/useGroupName';
import { formatBytes } from '@/shared/lib/formatUtils';
import { formatYouTubeDuration, formatYouTubeViews } from '@/shared/lib/youtubeApi';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string | null;
  categoryId?: string | null;
  redirectTo?: string | null;
  onCreated?: (postId: string) => void;
}

const MAX_ATTACHMENTS = 10;

const CreatePostModal = (props: CreatePostModalProps) => {
  const { user } = useAuth();
  if (!props.isOpen) return null;
  return createPortal(
    <CreatePostSession
      key={`${user?.uid ?? 'anonymous'}:${props.groupId ?? ''}:${props.categoryId ?? ''}`}
      {...props}
    />,
    document.body,
  );
};

const CreatePostSession = ({
  isOpen,
  onClose,
  groupId = null,
  categoryId = null,
  redirectTo = '/feed',
  onCreated,
}: CreatePostModalProps) => {
  const formId = useId();
  const groupName = useGroupName(groupId);
  const [showYoutubeField, setShowYoutubeField] = useState(false);
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
    isPreparingMedia,
    error,
    progress,
    canSubmit,
    draftRestoring,
    draftSaving,
    draftError,
    retryDraftSave,
    discardDraft,
    closeEditor,
    isPublished,
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

  const mediaLocked =
    isSubmitting || isPreparingMedia || draftRestoring || usedMediaSlots >= MAX_ATTACHMENTS;
  const showYoutube = showYoutubeField || youtubeUrl.trim().length > 0;
  const nearLimit = (value: string, limit: number) => value.length >= limit * 0.8;
  const toolButton =
    'flex h-10 items-center gap-2 rounded-full px-3 text-sm text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const removeButton =
    'absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white transition-opacity md:opacity-0 md:group-hover:opacity-100';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crear publicación"
        className="flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-neutral-950 pb-[env(safe-area-inset-bottom)] md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-3xl md:pb-0"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <button
            onClick={() => void closeEditor().catch(() => {})}
            disabled={isSubmitting || isPreparingMedia || (draftRestoring && !draftError)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <h2 className="font-display text-lg text-white">Crear publicación</h2>
          <span className="w-9" aria-hidden="true" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Who publishes and where. */}
          <div className="mb-4 flex items-center gap-3">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Usuario'}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 font-semibold text-black">
                {(user?.displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {user?.displayName || 'Usuario'}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {groupId
                  ? `Se publicará en ${groupName ?? 'el grupo'}`
                  : 'Se publicará en tu perfil'}
              </p>
            </div>
          </div>

          <input
            id={`${formId}-title`}
            type="text"
            aria-label="Título (opcional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título (opcional)"
            className="w-full bg-transparent font-display text-2xl text-white placeholder-neutral-600 focus:outline-none"
            maxLength={LIMITS.posts.titleMaxLength}
            disabled={isSubmitting || draftRestoring}
          />
          {nearLimit(title, LIMITS.posts.titleMaxLength) && (
            <p className="mt-1 text-right text-xs tabular-nums text-neutral-500">
              {title.length}/{LIMITS.posts.titleMaxLength}
            </p>
          )}

          <textarea
            disabled={draftRestoring}
            aria-label="Descripción de la publicación"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="¿Qué quieres compartir?"
            className="mt-3 min-h-[9rem] w-full resize-none bg-transparent text-[17px] leading-relaxed text-white placeholder-neutral-500 focus:outline-none"
            maxLength={LIMITS.posts.textMaxLength}
            autoFocus
          />
          {nearLimit(text, LIMITS.posts.textMaxLength) && (
            <p className="text-right text-xs tabular-nums text-neutral-500">
              {text.length}/{LIMITS.posts.textMaxLength}
            </p>
          )}

          {showYoutube && (
            <div className="mt-4">
              <label htmlFor={`${formId}-youtube`} className="sr-only">
                Enlace de YouTube (opcional)
              </label>
              <div className="relative">
                <Link2
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  id={`${formId}-youtube`}
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="Pega un enlace de YouTube"
                  className="h-11 w-full rounded-full border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder-neutral-500 transition-colors focus:border-white/25 focus:outline-none"
                  disabled={isSubmitting || draftRestoring}
                />
              </div>
              {youtubeUrl.trim() && (
                <p className={`mt-2 text-xs ${youtubeMeta ? 'text-emerald-400' : 'text-red-400'}`}>
                  {youtubeMeta
                    ? 'Video de YouTube detectado correctamente.'
                    : 'Enlace inválido. Usa youtube.com o youtu.be.'}
                </p>
              )}
              {youtubeLoading && (
                <p className="mt-2 text-xs text-neutral-400">Consultando el video…</p>
              )}
              {youtubeError && !youtubeLoading && (
                <p className="mt-2 text-xs text-amber-300">{youtubeError}</p>
              )}
              {youtubeDetails && youtubeMeta && (
                <div
                  className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
                    youtubeDetails.embeddable
                      ? 'border-white/10 bg-white/[0.03] text-neutral-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  <p className="line-clamp-2 text-sm font-medium text-white">
                    {youtubeDetails.title || 'Video de YouTube'}
                  </p>
                  <p className="mt-1 text-neutral-400">
                    {youtubeDetails.channelTitle || 'Canal desconocido'}
                    {formatYouTubeDuration(youtubeDetails.durationIso)
                      ? ` · ${formatYouTubeDuration(youtubeDetails.durationIso)}`
                      : ''}
                    {formatYouTubeViews(youtubeDetails.viewCount)
                      ? ` · ${formatYouTubeViews(youtubeDetails.viewCount)} vistas`
                      : ''}
                  </p>
                  <p className="mt-1">
                    {youtubeDetails.embeddable
                      ? 'Se reproducirá dentro de Vinctus.'
                      : 'YouTube no permite reproducir este video dentro de Vinctus.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {imageAttachments.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {imageAttachments.map((imageAttachment) => (
                <div key={imageAttachment.id} className="group relative">
                  <img
                    src={imageAttachment.previewUrl}
                    alt="Preview"
                    className="h-40 w-full rounded-2xl object-cover"
                  />
                  {!isSubmitting && (
                    <button
                      onClick={() => removeAttachment(imageAttachment.id)}
                      className={removeButton}
                      aria-label="Eliminar imagen adjunta"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {videoAttachments.length + fileAttachments.length > 0 && (
            <div className="mt-4 space-y-2">
              {[
                ...videoAttachments.map((item) => ({ item, kind: 'video' as const })),
                ...fileAttachments.map((item) => ({ item, kind: 'file' as const })),
              ].map(({ item, kind }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-200">
                    {kind === 'video' ? (
                      <Film size={16} className="shrink-0 text-brand-gold/80" />
                    ) : (
                      <FileText size={16} className="shrink-0 text-brand-gold/80" />
                    )}
                    <span className="truncate">{item.file.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-neutral-500">{formatBytes(item.file.size)}</span>
                    {!isSubmitting && (
                      <button
                        onClick={() => removeAttachment(item.id)}
                        className="text-neutral-500 transition-colors hover:text-white"
                        aria-label={
                          kind === 'video' ? 'Eliminar video adjunto' : 'Eliminar archivo adjunto'
                        }
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
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {isPreparingMedia && (
            <p role="status" className="mt-3 text-sm text-neutral-400">
              Preparando imágenes…
            </p>
          )}

          {isSubmitting && progress.total > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-sm text-neutral-400">
                <span>Subiendo archivos…</span>
                <span className="tabular-nums">{progress.percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-800">
                <div
                  className="h-1.5 rounded-full bg-brand-gold transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-4 pb-3 pt-2">
          {/* The draft: saved on this device, or what went wrong. */}
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-neutral-500">
            <p role="status">
              {draftError
                ? 'Borrador pendiente de recuperar o guardar'
                : draftRestoring
                  ? 'Recuperando borrador…'
                  : draftSaving
                    ? 'Guardando borrador…'
                    : 'Borrador guardado en este dispositivo'}
            </p>
            <button
              type="button"
              aria-label="Descartar borrador"
              disabled={isSubmitting || isPreparingMedia || draftRestoring}
              className="text-neutral-400 underline-offset-2 transition-colors hover:text-white hover:underline disabled:opacity-50"
              onClick={() => {
                if (
                  window.confirm(
                    '¿Descartar este borrador y sus adjuntos guardados en este dispositivo?',
                  )
                )
                  void discardDraft().catch(() => {});
              }}
            >
              Descartar
            </button>
            {usedMediaSlots > 0 && (
              <span className="ml-auto tabular-nums">
                {usedMediaSlots}/{MAX_ATTACHMENTS} · {formatBytes(totalAttachmentSize)}
                {youtubeMeta ? ' · YouTube' : ''}
              </span>
            )}
          </div>
          {draftError && (
            <div role="alert" className="mb-2 px-1 text-xs text-amber-300">
              <p>{draftError} No cierres el editor si tienes cambios sin guardar.</p>
              <button
                type="button"
                onClick={() => void retryDraftSave().catch(() => {})}
                className="mt-1 underline"
              >
                Reintentar guardado
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <input
              ref={imageInputRef}
              aria-label="Seleccionar imágenes de la publicación"
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              aria-label="Seleccionar videos de la publicación"
              type="file"
              accept="video/*"
              multiple
              onChange={handleVideoSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              aria-label="Seleccionar documentos de la publicación"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button onClick={openImagePicker} disabled={mediaLocked} className={toolButton}>
              <ImageIcon size={20} />
              <span className="hidden sm:inline">Fotos</span>
              <span className="sr-only sm:hidden">Fotos</span>
            </button>
            <button onClick={openVideoPicker} disabled={mediaLocked} className={toolButton}>
              <Film size={20} />
              <span className="hidden sm:inline">Video</span>
              <span className="sr-only sm:hidden">Video</span>
            </button>
            <button onClick={openFilePicker} disabled={mediaLocked} className={toolButton}>
              <FileText size={20} />
              <span className="hidden sm:inline">Archivo</span>
              <span className="sr-only sm:hidden">Archivo</span>
            </button>
            <button
              type="button"
              onClick={() => setShowYoutubeField(true)}
              disabled={isSubmitting || draftRestoring}
              aria-pressed={showYoutube}
              className={`${toolButton} ${showYoutube ? 'text-white' : ''}`}
            >
              <Play size={20} />
              <span className="hidden sm:inline">YouTube</span>
              <span className="sr-only sm:hidden">YouTube</span>
            </button>

            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="ml-auto flex h-10 items-center justify-center gap-2 rounded-full bg-brand-gold px-5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Publicando...
                </>
              ) : isPublished ? (
                'Abrir publicación'
              ) : (
                'Publicar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePostModal;
