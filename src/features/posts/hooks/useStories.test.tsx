import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryRead } from '@/features/posts/api';
import { useStories } from '@/features/posts/hooks/useStories';

const mockGetBlockedUsers = vi.fn();
const mockGetFriendIds = vi.fn();
const mockGetFollowingIds = vi.fn();
const mockGetStoriesForOwners = vi.fn();
const mockFetchYouTubeShorts = vi.fn();

vi.mock('@/features/posts/api', () => ({
  getBlockedUsers: (...args: unknown[]) => mockGetBlockedUsers(...args),
  getFriendIds: (...args: unknown[]) => mockGetFriendIds(...args),
  getFollowingIds: (...args: unknown[]) => mockGetFollowingIds(...args),
  getStoriesForOwners: (...args: unknown[]) => mockGetStoriesForOwners(...args),
}));

vi.mock('@/shared/lib/youtubeShortsApi', () => ({
  fetchYouTubeShorts: (...args: unknown[]) => mockFetchYouTubeShorts(...args),
}));

const makeStory = (id: string, ownerId: string, ownerName: string): StoryRead => ({
  id,
  ownerId,
  ownerSnapshot: { displayName: ownerName, photoURL: null },
  mediaType: 'image',
  mediaUrl: `https://example.com/${id}.jpg`,
  mediaPath: `stories/${ownerId}/${id}/original/story.jpg`,
  thumbUrl: null,
  thumbPath: null,
  visibility: 'friends',
  createdAt: new Date(Date.now() - 10_000),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
});

describe('useStories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchYouTubeShorts.mockResolvedValue({
      cached: false,
      fetchedAt: '2026-11-18T00:00:00Z',
      items: [],
      limit: 50,
      query: 'shorts',
      ttlSeconds: 3600,
    });
  });

  it('excluye usuarios bloqueados antes de consultar historias y permite removerlos en memoria', async () => {
    mockGetBlockedUsers.mockResolvedValue(['blocked_1']);
    mockGetFriendIds.mockResolvedValue(['friend_1', 'blocked_1']);
    mockGetFollowingIds.mockResolvedValue(['follow_1']);
    mockGetStoriesForOwners.mockImplementation(async (owners: string[]) => {
      if (owners.length === 1 && owners[0] === 'me_1') {
        return [makeStory('s_me', 'me_1', 'Yo')];
      }
      return [
        makeStory('s_friend', 'friend_1', 'Amigo'),
        makeStory('s_blocked_cached', 'blocked_1', 'Bloqueado'),
      ];
    });

    const { result } = renderHook(() =>
      useStories({ userId: 'me_1', userDisplayName: 'Yo', userPhotoURL: null }),
    );

    await waitFor(() => {
      expect(result.current.ownGroup?.ownerId).toBe('me_1');
      expect(result.current.friendGroups.some((g) => g.ownerId === 'friend_1')).toBe(true);
    });

    expect(mockGetStoriesForOwners).toHaveBeenCalledWith(['friend_1', 'follow_1']);
    expect(result.current.groups.some((g) => g.ownerId === 'blocked_1')).toBe(false);
    expect(result.current.error).toBeNull();

    act(() => {
      result.current.removeStory('s_me');
    });
    expect(result.current.ownGroup).toBeNull();

    act(() => {
      result.current.excludeOwner('friend_1');
    });
    expect(result.current.friendGroups.some((g) => g.ownerId === 'friend_1')).toBe(false);
  });

  it('expone error cuando fallan historias reales aunque existan Shorts de respaldo', async () => {
    mockGetStoriesForOwners.mockRejectedValue(new Error('network-error'));
    mockGetFriendIds.mockRejectedValue(new Error('network-error'));
    mockGetFollowingIds.mockRejectedValue(new Error('network-error'));
    mockGetBlockedUsers.mockResolvedValue([]);

    const { result } = renderHook(() => useStories({ userId: 'me_1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('No se pudieron cargar historias.');
    });

    expect(result.current.groups.length).toBeGreaterThan(0);
  });
});
