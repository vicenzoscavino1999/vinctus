import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { StoryRead } from '@/features/posts/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';

interface StoryViewerModalProps {
  isOpen: boolean;
  stories: StoryRead[];
  ownerName: string;
  ownerPhoto: string | null;
  initialIndex?: number;
  onClose: () => void;
}

// formatRelativeTime imported from @/shared/lib/formatUtils

const StoryViewerModal = ({
  isOpen,
  stories,
  ownerName,
  ownerPhoto,
  initialIndex = 0,
  onClose,
}: StoryViewerModalProps) => {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, onClose]);

  const clampedActiveIndex = Math.min(activeIndex, Math.max(stories.length - 1, 0));
  const activeStory = stories[clampedActiveIndex];
  const canGoPrev = clampedActiveIndex > 0;
  const canGoNext = clampedActiveIndex < stories.length - 1;

  const displayTime = useMemo(() => {
    if (!activeStory) return '';
    return formatRelativeTime(activeStory.createdAt);
  }, [activeStory]);

  if (!isOpen || !activeStory) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-md h-[75vh] bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute top-4 left-4 right-4 z-10">
          <div className="flex items-center gap-2 mb-3">
            {stories.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full ${index <= clampedActiveIndex ? 'bg-white' : 'bg-white/20'}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center">
                {ownerPhoto ? (
                  <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-neutral-300">
                    {(ownerName || 'U')[0]}
                  </span>
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{ownerName || 'Usuario'}</div>
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

        <div className="w-full h-full flex items-center justify-center">
          {activeStory.mediaType === 'image' ? (
            <img
              src={activeStory.mediaUrl}
              alt="Historia"
              className="w-full h-full object-contain"
            />
          ) : (
            <video
              src={activeStory.mediaUrl}
              className="w-full h-full object-contain"
              controls
              autoPlay
              muted
              playsInline
            />
          )}
        </div>

        {canGoPrev && (
          <button
            onClick={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {canGoNext && (
          <button
            onClick={() =>
              setActiveIndex((prev) => Math.min(prev + 1, Math.max(stories.length - 1, 0)))
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
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

export default StoryViewerModal;
