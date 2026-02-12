import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import StoryComposerModal from '@/features/posts/components/StoryComposerModal';
import StoryViewerModal, {
  type StoryViewerGroup,
} from '@/features/posts/components/StoryViewerModal';
import { type StoryGroup, useStories } from '@/features/posts/hooks/useStories';

const StoriesWidget = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    groups: StoryViewerGroup[];
    initialGroupIndex: number;
    initialStoryIndex: number;
  }>({ isOpen: false, groups: [], initialGroupIndex: 0, initialStoryIndex: 0 });
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(() => new Set());

  const { error, friendGroups, groups, loading, ownGroup, refreshStories } = useStories({
    userDisplayName: user?.displayName ?? null,
    userId: user?.uid ?? null,
    userPhotoURL: user?.photoURL ?? null,
  });

  const viewerGroups = useMemo<StoryViewerGroup[]>(
    () =>
      groups.map((group) => ({
        ownerId: group.ownerId,
        ownerName: group.ownerName,
        ownerPhoto: group.ownerPhoto,
        stories: group.items,
      })),
    [groups],
  );

  if (!user) return null;

  const isGroupSeen = (group: StoryGroup): boolean =>
    group.items.length > 0 && group.items.every((item) => seenStoryIds.has(item.id));

  const markStorySeen = (storyId: string) => {
    setSeenStoryIds((previous) => {
      if (previous.has(storyId)) return previous;
      const next = new Set(previous);
      next.add(storyId);
      return next;
    });
  };

  const openViewer = (group: StoryGroup, initialStoryIndex: number = 0) => {
    const groupIndex = viewerGroups.findIndex((item) => item.ownerId === group.ownerId);
    if (groupIndex < 0) return;
    setViewerState({
      isOpen: true,
      groups: viewerGroups,
      initialGroupIndex: groupIndex,
      initialStoryIndex,
    });
  };

  const handleOwnClick = () => {
    if (ownGroup) {
      openViewer(ownGroup);
    } else {
      setIsComposerOpen(true);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-[0.3em] text-neutral-500">Historias</h3>
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        <div className="flex-shrink-0 flex flex-col items-center gap-2 text-center group">
          <div className="relative">
            <button
              onClick={handleOwnClick}
              className={`w-16 h-16 rounded-full border-2 ${ownGroup && !isGroupSeen(ownGroup) ? 'border-amber-400' : 'border-neutral-700'} bg-neutral-900 flex items-center justify-center overflow-hidden`}
              aria-label="Ver tu historia"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Tu historia'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg font-serif text-amber-300">
                  {(user.displayName || 'T')[0]}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsComposerOpen(true)}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-md hover:bg-amber-400 transition-colors"
              aria-label="Agregar historia"
            >
              <Plus size={14} />
            </button>
          </div>
          <span className="max-w-[80px] truncate text-xs text-neutral-300">Tu historia</span>
        </div>

        {loading ? (
          <div className="flex gap-4 items-center">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full skeleton-avatar" />
                <div className="w-16 h-3 skeleton-text" />
              </div>
            ))}
          </div>
        ) : (
          friendGroups.map((group) => (
            <button
              key={group.ownerId}
              onClick={() => openViewer(group)}
              className="flex-shrink-0 flex flex-col items-center gap-2 text-center group"
            >
              <div
                className={`w-16 h-16 rounded-full border-2 ${isGroupSeen(group) ? 'border-neutral-700' : 'border-amber-400'} bg-neutral-900 flex items-center justify-center overflow-hidden`}
              >
                {group.ownerPhoto ? (
                  <img
                    src={group.ownerPhoto}
                    alt={group.ownerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-serif text-neutral-200">
                    {(group.ownerName || 'U')[0]}
                  </span>
                )}
              </div>
              <span className="max-w-[80px] truncate text-xs text-neutral-400 group-hover:text-neutral-200 transition-colors">
                {group.ownerName || 'Usuario'}
              </span>
            </button>
          ))
        )}
      </div>

      <StoryComposerModal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onCreated={() => {
          refreshStories().catch(() => {
            showToast('No se pudieron actualizar las historias.', 'warning');
          });
        }}
      />

      {viewerState.isOpen && (
        <StoryViewerModal
          isOpen={viewerState.isOpen}
          groups={viewerState.groups}
          initialGroupIndex={viewerState.initialGroupIndex}
          initialStoryIndex={viewerState.initialStoryIndex}
          onStorySeen={markStorySeen}
          onClose={() =>
            setViewerState({
              isOpen: false,
              groups: [],
              initialGroupIndex: 0,
              initialStoryIndex: 0,
            })
          }
        />
      )}
    </div>
  );
};

export default StoriesWidget;
