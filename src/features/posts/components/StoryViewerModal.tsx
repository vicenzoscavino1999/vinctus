import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
  onClose: () => void;
  onStorySeen?: (storyId: string) => void;
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
  onClose,
  onStorySeen,
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

  const safeActiveGroupIndex = Math.max(
    0,
    Math.min(activeGroupIndex, Math.max(groups.length - 1, 0)),
  );

  const activeGroup = groups[safeActiveGroupIndex] ?? null;
  const activeStories = activeGroup?.stories ?? [];
  const clampedStoryIndex = Math.min(activeStoryIndex, Math.max(activeStories.length - 1, 0));
  const activeStory = activeStories[clampedStoryIndex] ?? null;
  const shouldAutoAdvance = activeStory?.mediaType === 'image';

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
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    if (!activeStory || !onStorySeen) return;
    onStorySeen(activeStory.id);
  }, [activeStory, onStorySeen]);

  useEffect(() => {
    if (!activeStory) return;
    if (!shouldAutoAdvance) return;

    const durationMs = AUTO_ADVANCE_IMAGE_MS;
    const start = Date.now();

    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - start;
      const nextPct = Math.min(100, Math.round((elapsedMs / durationMs) * 100));
      setProgressPct(nextPct);
    }, PROGRESS_TICK_MS);

    const timeoutId = window.setTimeout(() => {
      goNext();
    }, durationMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [activeStory, goNext, shouldAutoAdvance]);

  const displayTime = useMemo(() => {
    if (!activeStory) return '';
    return formatRelativeTime(activeStory.createdAt);
  }, [activeStory]);

  const activeYouTubeVideoId = useMemo(() => {
    if (!activeStory) return null;
    return getYouTubeVideoIdFromStory(activeStory);
  }, [activeStory]);

  if (!activeStory || !activeGroup) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset bg-black/90">
      <div className="absolute inset-0" onClick={onClose} />
      <div
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center">
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
              <div>
                <div className="text-sm font-medium text-white">
                  {activeGroup.ownerName || 'Usuario'}
                </div>
                <div className="text-xs text-neutral-400">{displayTime}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="relative w-full h-[calc(100%-5.75rem)] flex items-center justify-center bg-black">
          {activeStory.mediaType === 'image' ? (
            <img
              src={activeStory.mediaUrl}
              alt="Historia"
              className="w-full h-full object-contain"
            />
          ) : activeYouTubeVideoId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeYouTubeVideoId}?rel=0&autoplay=1&mute=1&playsinline=1&modestbranding=1`}
              title={activeStory.ownerName || 'YouTube Short'}
              className="w-full h-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              src={activeStory.mediaUrl}
              className="w-full h-full object-contain"
              controls
              autoPlay
              muted
              playsInline
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
