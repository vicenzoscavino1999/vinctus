import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context';
import { useToast } from '@/shared/ui/Toast';
import { getFriendIds, getStoriesForOwners, type StoryRead } from '@/features/posts/api';
import StoryComposerModal from '@/features/posts/components/StoryComposerModal';
import StoryViewerModal from '@/features/posts/components/StoryViewerModal';

type StoryGroup = {
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
  items: StoryRead[];
  latestAt: number;
};

const StoriesWidget = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [stories, setStories] = useState<StoryRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    ownerName: string;
    ownerPhoto: string | null;
    stories: StoryRead[];
  }>({ isOpen: false, ownerName: '', ownerPhoto: null, stories: [] });

  const refreshStories = useCallback(async () => {
    if (!user) {
      setStories([]);
      return;
    }
    setLoading(true);
    setError(null);

    let hadFailure = false;
    let nextStories: StoryRead[] = [];

    try {
      console.log('[StoriesWidget] Cargando historias propias para uid:', user.uid);
      const ownStories = await getStoriesForOwners([user.uid]);
      nextStories = ownStories;
      console.log('[StoriesWidget] Historias propias cargadas:', ownStories.length);
    } catch (ownError) {
      hadFailure = true;
      console.error('[StoriesWidget] ❌ ERROR loading own stories:', ownError);

      // Log el código de error específico
      const code = (ownError as { code?: string })?.code;
      console.error('[StoriesWidget] Error code:', code);
    }

    let friendIds: string[] = [];
    try {
      friendIds = await getFriendIds(user.uid);
    } catch (friendError) {
      hadFailure = true;
      console.warn('Error loading friend ids, showing own stories only:', friendError);
    }

    if (friendIds.length > 0) {
      try {
        const friendStories = await getStoriesForOwners(friendIds);
        const merged = new Map<string, StoryRead>();
        [...nextStories, ...friendStories].forEach((story) => merged.set(story.id, story));
        nextStories = Array.from(merged.values());
      } catch (friendStoryError) {
        hadFailure = true;
        console.warn('Error loading friend stories:', friendStoryError);
      }
    }

    if (nextStories.length === 0 && hadFailure) {
      setError('No se pudieron cargar historias.');
    }

    setStories(nextStories);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshStories();
    });
  }, [refreshStories]);

  const groups = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, StoryGroup>();
    stories.forEach((story) => {
      const existing = map.get(story.ownerId);
      const ownerName = story.ownerSnapshot.displayName || 'Usuario';
      const ownerPhoto = story.ownerSnapshot.photoURL || null;
      const createdAt = story.createdAt?.getTime?.() ?? 0;

      if (!existing) {
        map.set(story.ownerId, {
          ownerId: story.ownerId,
          ownerName,
          ownerPhoto,
          items: [story],
          latestAt: createdAt,
        });
      } else {
        existing.items.push(story);
        existing.latestAt = Math.max(existing.latestAt, createdAt);
        if (!existing.ownerName && ownerName) {
          existing.ownerName = ownerName;
        }
        if (!existing.ownerPhoto && ownerPhoto) {
          existing.ownerPhoto = ownerPhoto;
        }
      }
    });

    const grouped = Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const aTime = a.createdAt?.getTime?.() ?? 0;
        const bTime = b.createdAt?.getTime?.() ?? 0;
        return aTime - bTime;
      }),
    }));

    grouped.sort((a, b) => b.latestAt - a.latestAt);

    const ownIndex = grouped.findIndex((group) => group.ownerId === user.uid);
    if (ownIndex > -1) {
      const [ownGroup] = grouped.splice(ownIndex, 1);
      grouped.unshift({
        ...ownGroup,
        ownerName: user.displayName || ownGroup.ownerName,
        ownerPhoto: user.photoURL || ownGroup.ownerPhoto,
      });
    }

    return grouped;
  }, [stories, user]);

  if (!user) return null;

  const ownGroup = groups.find((group) => group.ownerId === user.uid) ?? null;
  const friendGroups = groups.filter((group) => group.ownerId !== user.uid);

  const openViewer = (group: StoryGroup) => {
    setViewerState({
      isOpen: true,
      ownerName: group.ownerName,
      ownerPhoto: group.ownerPhoto,
      stories: group.items,
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
              className={`w-16 h-16 rounded-full border-2 ${ownGroup ? 'border-amber-400' : 'border-neutral-700'} bg-neutral-900 flex items-center justify-center overflow-hidden`}
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
          <span className="text-xs text-neutral-300">Tu historia</span>
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
              <div className="w-16 h-16 rounded-full border-2 border-amber-400 bg-neutral-900 flex items-center justify-center overflow-hidden">
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
              <span className="text-xs text-neutral-400 group-hover:text-neutral-200 transition-colors">
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
          stories={viewerState.stories}
          ownerName={viewerState.ownerName}
          ownerPhoto={viewerState.ownerPhoto}
          onClose={() =>
            setViewerState({ isOpen: false, ownerName: '', ownerPhoto: null, stories: [] })
          }
        />
      )}
    </div>
  );
};

export default StoriesWidget;
