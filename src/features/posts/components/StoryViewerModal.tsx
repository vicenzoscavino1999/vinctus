import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Flag, MoreVertical, ShieldBan, Trash2, X } from 'lucide-react';
import type { UserReportReason } from '@/features/posts/api';
import ContentReportModal from '@/features/posts/components/ContentReportModal';
import type { StoryFeedItem } from '@/features/posts/hooks/useStories';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { parseYouTubeUrl } from '@/shared/lib/youtube';

const AUTO_ADVANCE_IMAGE_MS = 5000;
const PROGRESS_TICK_MS = 100;

export interface StoryViewerGroup {
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
  stories: StoryFeedItem[];
}

interface StoryViewerModalProps {
  isOpen: boolean;
  groups: StoryViewerGroup[];
  initialGroupIndex?: number;
  initialStoryIndex?: number;
  currentUserId?: string | null;
  onClose: () => void;
  onStorySeen?: (storyId: string) => void;
  onDeleteStory?: (story: StoryFeedItem) => Promise<void>;
  onReportStory?: (
    story: StoryFeedItem,
    reason: UserReportReason,
    details: string,
  ) => Promise<void>;
  onBlockUser?: (ownerId: string, ownerName: string) => Promise<void>;
}

const getYouTubeVideoIdFromStory = (story: StoryFeedItem): string | null => {
  const mediaPath = story.mediaPath?.trim() || '';
  if (mediaPath.startsWith('youtube:')) {
    const videoId = mediaPath.slice('youtube:'.length).trim();
    return videoId || null;
  }
  return parseYouTubeUrl(story.mediaUrl)?.videoId ?? null;
};

const findNextGroupIndex = (groups: StoryViewerGroup[], fromIndex: number): number => {
  for (let index = fromIndex + 1; index < groups.length; index += 1) {
    if ((groups[index]?.stories?.length ?? 0) > 0) {
      return index;
    }
  }
  return -1;
};

const findPrevGroupIndex = (groups: StoryViewerGroup[], fromIndex: number): number => {
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    if ((groups[index]?.stories?.length ?? 0) > 0) {
      return index;
    }
  }
  return -1;
};

type StoryViewerModalContentProps = Omit<StoryViewerModalProps, 'isOpen'>;

const StoryViewerModalContent = ({
  groups,
  initialGroupIndex = 0,
  initialStoryIndex = 0,
  currentUserId = null,
  onClose,
  onStorySeen,
  onDeleteStory,
  onReportStory,
  onBlockUser,
}: StoryViewerModalContentProps) => {
  const safeInitialGroupIndex = useMemo(() => {
    const maxGroupIndex = Math.max(0, groups.length - 1);
    return Math.max(0, Math.min(initialGroupIndex, maxGroupIndex));
  }, [groups.length, initialGroupIndex]);

  const safeInitialGroup = groups[safeInitialGroupIndex] ?? null;
  const safeStartStoryIndex = useMemo(
    () =>
      Math.max(
        0,
        Math.min(initialStoryIndex, Math.max((safeInitialGroup?.stories?.length ?? 1) - 1, 0)),
      ),
    [initialStoryIndex, safeInitialGroup],
  );

  const [activeGroupIndex, setActiveGroupIndex] = useState(safeInitialGroupIndex);
  const [activeStoryIndex, setActiveStoryIndex] = useState(safeStartStoryIndex);
  const [progressPct, setProgressPct] = useState(0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<UserReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isConfirmingBlock, setIsConfirmingBlock] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [isDocumentHidden, setIsDocumentHidden] = useState(() =>
    typeof document !== 'undefined' ? document.hidden : false,
  );
  const [mediaLoadErrorStoryId, setMediaLoadErrorStoryId] = useState<string | null>(null);
  const elapsedMsRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const safeActiveGroupIndex = Math.max(
    0,
    Math.min(activeGroupIndex, Math.max(groups.length - 1, 0)),
  );

  const activeGroup = groups[safeActiveGroupIndex] ?? null;
  const activeStories = activeGroup?.stories ?? [];
  const clampedStoryIndex = Math.min(activeStoryIndex, Math.max(activeStories.length - 1, 0));
  const activeStory = activeStories[clampedStoryIndex] ?? null;
  const shouldAutoAdvance = activeStory?.mediaType === 'image';
  const isPaused =
    isConfirmingDelete ||
    isDeleting ||
    isActionsMenuOpen ||
    isReportOpen ||
    isConfirmingBlock ||
    isBlocking ||
    isDocumentHidden;

  useEffect(() => {
    if (groups.length === 0) {
      onClose();
    }
  }, [groups.length, onClose]);

  useEffect(() => {
    elapsedMsRef.current = 0;
    setProgressPct(0);
    setIsConfirmingDelete(false);
    setDeleteError(null);
    setIsActionsMenuOpen(false);
    setIsConfirmingBlock(false);
    setBlockError(null);
    setMediaLoadErrorStoryId(null);
  }, [activeStory?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      setIsDocumentHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStory || activeStory.mediaType !== 'video') return;
    if (isPaused) {
      video.pause();
    } else {
      void video.play().catch(() => undefined);
    }
  }, [activeStory, isPaused]);

  const canGoPrev = useMemo(() => {
    if (!activeGroup) return false;
    return clampedStoryIndex > 0 || findPrevGroupIndex(groups, safeActiveGroupIndex) >= 0;
  }, [activeGroup, clampedStoryIndex, groups, safeActiveGroupIndex]);

  const canGoNext = useMemo(() => {
    if (!activeGroup) return false;
    return (
      clampedStoryIndex < activeStories.length - 1 ||
      findNextGroupIndex(groups, safeActiveGroupIndex) >= 0
    );
  }, [activeGroup, activeStories.length, clampedStoryIndex, groups, safeActiveGroupIndex]);

  const goPrev = useCallback(() => {
    if (!activeGroup) return;
    if (clampedStoryIndex > 0) {
      setActiveStoryIndex((prev) => Math.max(0, prev - 1));
      setProgressPct(0);
      return;
    }

    const prevGroupIndex = findPrevGroupIndex(groups, safeActiveGroupIndex);
    if (prevGroupIndex < 0) return;
    const prevStories = groups[prevGroupIndex]?.stories ?? [];
    setActiveGroupIndex(prevGroupIndex);
    setActiveStoryIndex(Math.max(0, prevStories.length - 1));
    setProgressPct(0);
  }, [activeGroup, clampedStoryIndex, groups, safeActiveGroupIndex]);

  const goNext = useCallback(() => {
    if (!activeGroup) return;
    if (clampedStoryIndex < activeStories.length - 1) {
      setActiveStoryIndex((prev) => Math.min(prev + 1, Math.max(activeStories.length - 1, 0)));
      setProgressPct(0);
      return;
    }

    const nextGroupIndex = findNextGroupIndex(groups, safeActiveGroupIndex);
    if (nextGroupIndex < 0) {
      onClose();
      return;
    }

    setActiveGroupIndex(nextGroupIndex);
    setActiveStoryIndex(0);
    setProgressPct(0);
  }, [activeGroup, activeStories.length, clampedStoryIndex, groups, onClose, safeActiveGroupIndex]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isReportOpen) {
          if (!isSubmittingReport) setIsReportOpen(false);
          return;
        }
        if (isConfirmingBlock) {
          if (!isBlocking) setIsConfirmingBlock(false);
          return;
        }
        if (isConfirmingDelete) {
          if (!isDeleting) setIsConfirmingDelete(false);
          return;
        }
        if (isActionsMenuOpen) {
          setIsActionsMenuOpen(false);
          return;
        }
        onClose();
        return;
      }

      if (isPaused) return;
      const targetTag = (event.target as HTMLElement | null)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
        return;
      }
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [
    goNext,
    goPrev,
    isActionsMenuOpen,
    isBlocking,
    isConfirmingBlock,
    isConfirmingDelete,
    isDeleting,
    isPaused,
    isReportOpen,
    isSubmittingReport,
    onClose,
  ]);

  useEffect(() => {
    if (!activeStory || !onStorySeen) return;
    onStorySeen(activeStory.id);
  }, [activeStory, onStorySeen]);

  useEffect(() => {
    if (!activeStory || !shouldAutoAdvance || isPaused) return;

    const baseElapsed = elapsedMsRef.current;
    const remainingMs = Math.max(0, AUTO_ADVANCE_IMAGE_MS - baseElapsed);
    const start = Date.now();

    const intervalId = window.setInterval(() => {
      const elapsed = baseElapsed + (Date.now() - start);
      elapsedMsRef.current = elapsed;
      const nextPct = Math.min(100, Math.round((elapsed / AUTO_ADVANCE_IMAGE_MS) * 100));
      setProgressPct(nextPct);
    }, PROGRESS_TICK_MS);

    const timeoutId = window.setTimeout(() => {
      elapsedMsRef.current = AUTO_ADVANCE_IMAGE_MS;
      goNext();
    }, remainingMs);

    return () => {
      elapsedMsRef.current = Math.min(
        AUTO_ADVANCE_IMAGE_MS,
        baseElapsed + Math.max(0, Date.now() - start),
      );
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [activeStory, goNext, isPaused, shouldAutoAdvance]);

  const displayTime = useMemo(() => {
    if (!activeStory) return '';
    return formatRelativeTime(activeStory.createdAt);
  }, [activeStory]);

  const activeYouTubeVideoId = useMemo(() => {
    if (!activeStory) return null;
    return getYouTubeVideoIdFromStory(activeStory);
  }, [activeStory]);

  if (!activeStory || !activeGroup) return null;

  const isOwnStory =
    activeStory.source === 'story' &&
    Boolean(currentUserId) &&
    activeStory.ownerId === currentUserId;
  const canModerateStory =
    activeStory.source === 'story' &&
    Boolean(currentUserId) &&
    activeStory.ownerId !== currentUserId &&
    Boolean(onReportStory || onBlockUser);
  const hasMediaError = mediaLoadErrorStoryId === activeStory.id;

  const handleConfirmDelete = async () => {
    if (!onDeleteStory || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteStory(activeStory);
      setIsConfirmingDelete(false);
      if (activeGroup.stories.length <= 1) {
        onClose();
      }
    } catch (error) {
      console.error('Error deleting story:', error);
      setDeleteError('No se pudo eliminar la historia.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!onReportStory || isSubmittingReport) return;
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      await onReportStory(activeStory, reportReason, reportDetails.trim());
      setIsReportOpen(false);
      setReportDetails('');
      setReportReason('spam');
    } catch (error) {
      console.error('Error reporting story:', error);
      setReportError('No se pudo enviar el reporte.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!onBlockUser || isBlocking) return;
    setIsBlocking(true);
    setBlockError(null);
    try {
      await onBlockUser(activeStory.ownerId, activeGroup.ownerName || 'Usuario');
      setIsConfirmingBlock(false);
      onClose();
    } catch (error) {
      console.error('Error blocking story owner:', error);
      setBlockError('No se pudo bloquear al usuario.');
    } finally {
      setIsBlocking(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset bg-black/90">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Visor de historias"
        className="relative w-full max-w-md h-[80vh] min-h-[560px] max-h-[820px] bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative z-10 px-4 pt-4 pb-3 bg-gradient-to-b from-black via-black/95 to-black/80 border-b border-white/10">
          <div className="flex items-center gap-2 mb-3">
            {activeStories.map((story, index) => {
              const pct =
                index < clampedStoryIndex
                  ? 100
                  : index === clampedStoryIndex
                    ? shouldAutoAdvance
                      ? progressPct
                      : 0
                    : 0;
              return (
                <div key={story.id} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white transition-[width] duration-100"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                {activeGroup.ownerPhoto ? (
                  <img
                    src={activeGroup.ownerPhoto}
                    alt={activeGroup.ownerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-neutral-300">
                    {(activeGroup.ownerName || 'U')[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {isOwnStory ? 'Tu historia' : activeGroup.ownerName || 'Usuario'}
                </div>
                <div className="text-xs text-neutral-400">{displayTime}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 relative">
              {isOwnStory && onDeleteStory && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setIsConfirmingDelete(true);
                  }}
                  className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-rose-300 transition-colors"
                  aria-label="Eliminar historia"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {canModerateStory && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsActionsMenuOpen((open) => !open)}
                    className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white transition-colors"
                    aria-label="Más opciones"
                    aria-expanded={isActionsMenuOpen}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {isActionsMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl py-1 z-30">
                      {onReportStory && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionsMenuOpen(false);
                            setReportError(null);
                            setIsReportOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-neutral-200 hover:bg-white/5"
                        >
                          <Flag size={14} className="text-amber-300" />
                          <span>Denunciar historia</span>
                        </button>
                      )}
                      {onBlockUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionsMenuOpen(false);
                            setBlockError(null);
                            setIsConfirmingBlock(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-rose-300 hover:bg-white/5"
                        >
                          <ShieldBan size={14} />
                          <span>Bloquear a {activeGroup.ownerName || 'usuario'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {isConfirmingDelete && (
            <div className="mt-3 rounded-xl border border-rose-500/40 bg-neutral-900/95 p-3 space-y-2">
              <p className="text-xs text-neutral-200">¿Eliminar esta historia?</p>
              {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-3 py-1 rounded-lg text-xs text-neutral-300 hover:text-white disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white disabled:opacity-50"
                >
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          )}

          {isConfirmingBlock && (
            <div className="mt-3 rounded-xl border border-rose-500/40 bg-neutral-900/95 p-3 space-y-2">
              <p className="text-xs text-neutral-200">
                ¿Bloquear a {activeGroup.ownerName || 'este usuario'}? No veras sus historias ni
                publicaciones.
              </p>
              {blockError && <p className="text-xs text-rose-400">{blockError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isBlocking}
                  onClick={() => setIsConfirmingBlock(false)}
                  className="px-3 py-1 rounded-lg text-xs text-neutral-300 hover:text-white disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isBlocking}
                  onClick={handleConfirmBlock}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white disabled:opacity-50"
                >
                  {isBlocking ? 'Bloqueando...' : 'Bloquear'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative w-full h-[calc(100%-5.75rem)] flex items-center justify-center bg-black">
          {hasMediaError ? (
            <div className="px-6 text-center text-sm text-neutral-400">
              No se pudo cargar la historia
            </div>
          ) : activeStory.mediaType === 'image' ? (
            <img
              key={activeStory.id}
              src={activeStory.mediaUrl}
              alt="Historia"
              onError={() => setMediaLoadErrorStoryId(activeStory.id)}
              className="w-full h-full object-contain"
            />
          ) : activeYouTubeVideoId ? (
            <iframe
              key={activeStory.id}
              src={`https://www.youtube-nocookie.com/embed/${activeYouTubeVideoId}?rel=0&autoplay=1&mute=1&playsinline=1&modestbranding=1`}
              title={activeStory.ownerName || 'YouTube Short'}
              className="w-full h-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              key={activeStory.id}
              src={activeStory.mediaUrl}
              poster={activeStory.thumbUrl ?? undefined}
              className="w-full h-full object-contain"
              controls
              autoPlay
              muted
              playsInline
              onError={() => setMediaLoadErrorStoryId(activeStory.id)}
              onEnded={goNext}
            />
          )}
        </div>

        {canGoPrev && (
          <button
            onClick={goPrev}
            className="absolute left-3 top-[calc(50%+2.875rem)] -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        {canGoNext && (
          <button
            onClick={goNext}
            className="absolute right-3 top-[calc(50%+2.875rem)] -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            aria-label="Siguiente"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <ContentReportModal
        open={isReportOpen}
        targetLabel="historia"
        reason={reportReason}
        details={reportDetails}
        error={reportError}
        isSubmitting={isSubmittingReport}
        onClose={() => {
          if (!isSubmittingReport) setIsReportOpen(false);
        }}
        onReasonChange={setReportReason}
        onDetailsChange={setReportDetails}
        onSubmit={handleSubmitReport}
      />
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

const StoryViewerModal = ({ isOpen, ...rest }: StoryViewerModalProps) => {
  if (!isOpen) return null;
  return <StoryViewerModalContent {...rest} />;
};

export default StoryViewerModal;
