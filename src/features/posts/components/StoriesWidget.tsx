import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  blockUser,
  createStoryReport,
  deleteStory,
  type UserReportReason,
} from '@/features/posts/api';
import StoryComposerModal from '@/features/posts/components/StoryComposerModal';
import StoryViewerModal, {
  type StoryViewerGroup,
} from '@/features/posts/components/StoryViewerModal';
import { type StoryFeedItem, type StoryGroup, useStories } from '@/features/posts/hooks/useStories';

const SEEN_STORIES_STORAGE_PREFIX = 'vinctus:seen-stories:';

const loadSeenStoryIds = (uid: string | undefined): Set<string> => {
  if (!uid || typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(`${SEEN_STORIES_STORAGE_PREFIX}${uid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))
      : new Set();
  } catch {
    return new Set();
  }
};

const saveSeenStoryIds = (uid: string | undefined, ids: Set<string>) => {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${SEEN_STORIES_STORAGE_PREFIX}${uid}`, JSON.stringify([...ids]));
  } catch {
    // Ignore storage quota / private mode failures cleanly.
  }
};

const StoriesWidget = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [composerOpenUid, setComposerOpenUid] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{
    uid: string | null;
    isOpen: boolean;
    initialGroupIndex: number;
    initialStoryIndex: number;
  }>({ uid: null, isOpen: false, initialGroupIndex: 0, initialStoryIndex: 0 });
  const [seenByUser, setSeenByUser] = useState<{ uid: string | null; ids: Set<string> }>(() => ({
    uid: user?.uid ?? null,
    ids: loadSeenStoryIds(user?.uid),
  }));

  const currentUid = user?.uid ?? null;
  const isComposerOpen = Boolean(currentUid && composerOpenUid === currentUid);
  const activeViewerState =
    viewerState.isOpen && currentUid && viewerState.uid === currentUid
      ? viewerState
      : { uid: currentUid, isOpen: false, initialGroupIndex: 0, initialStoryIndex: 0 };

  const seenStoryIds = useMemo(() => {
    if ((user?.uid ?? null) === seenByUser.uid) {
      return seenByUser.ids;
    }
    return loadSeenStoryIds(user?.uid);
  }, [seenByUser, user?.uid]);

  const {
    error,
    excludeOwner,
    friendGroups,
    groups,
    loading,
    ownGroup,
    refreshStories,
    removeStory,
  } = useStories({
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
    const activeUid = user.uid;
    setSeenByUser((previous) => {
      const base = previous.uid === activeUid ? previous.ids : loadSeenStoryIds(activeUid);
      if (base.has(storyId))
        return previous.uid === activeUid ? previous : { uid: activeUid, ids: base };
      const next = new Set(base);
      next.add(storyId);
      saveSeenStoryIds(activeUid, next);
      return { uid: activeUid, ids: next };
    });
  };

  const handleDeleteStory = async (story: StoryFeedItem) => {
    await deleteStory(story.id, {
      mediaPath: story.mediaPath,
      thumbPath: story.thumbPath ?? null,
    });
    removeStory(story.id);
    showToast('Historia eliminada', 'success');
    refreshStories().catch(() => undefined);
  };

  const handleReportStory = async (
    story: StoryFeedItem,
    reason: UserReportReason,
    details: string,
  ) => {
    await createStoryReport({
      reporterUid: user.uid,
      storyId: story.id,
      storyOwnerId: story.ownerId,
      reason,
      details: details || null,
    });
    showToast('Reporte enviado', 'success');
  };

  const handleBlockUser = async (ownerId: string, ownerName: string) => {
    await blockUser(user.uid, ownerId);
    excludeOwner(ownerId);
    showToast(`Usuario bloqueado: ${ownerName}`, 'info');
    refreshStories().catch(() => undefined);
  };

  const openViewer = (group: StoryGroup, initialStoryIndex: number = 0) => {
    const groupIndex = viewerGroups.findIndex((item) => item.ownerId === group.ownerId);
    if (groupIndex < 0) return;
    setViewerState({
      uid: user.uid,
      isOpen: true,
      initialGroupIndex: groupIndex,
      initialStoryIndex,
    });
  };

  const handleOwnClick = () => {
    if (ownGroup) {
      openViewer(ownGroup);
    } else {
      setComposerOpenUid(user.uid);
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
              onClick={() => setComposerOpenUid(user.uid)}
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
        onClose={() => setComposerOpenUid(null)}
        onCreated={() => {
          refreshStories().catch(() => {
            showToast('No se pudieron actualizar las historias.', 'warning');
          });
        }}
      />

      {activeViewerState.isOpen && (
        <StoryViewerModal
          isOpen={activeViewerState.isOpen}
          groups={viewerGroups}
          initialGroupIndex={activeViewerState.initialGroupIndex}
          initialStoryIndex={activeViewerState.initialStoryIndex}
          currentUserId={user.uid}
          onStorySeen={markStorySeen}
          onDeleteStory={handleDeleteStory}
          onReportStory={handleReportStory}
          onBlockUser={handleBlockUser}
          onClose={() =>
            setViewerState({
              uid: null,
              isOpen: false,
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
