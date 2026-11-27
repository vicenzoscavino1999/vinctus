import { getGroupsByCategory } from '@/features/groups/api';
import {
  getBlockedUsers,
  getContributionsByCategory,
  getUserProfile,
  type ContributionRead,
} from '@/features/profile/api';
import { useSessionResource } from '@/shared/hooks/useSessionResource';

export type CategoryLibraryItem = ContributionRead & {
  authorName: string;
  authorPhoto: string | null;
};

/**
 * The category's communities, asked only once its tab is opened and kept for the session, so
 * coming back shows them at once.
 */
export function useCategoryGroups(categoryId: string | null, enabled: boolean) {
  return useSessionResource(enabled && categoryId ? `category:${categoryId}:groups` : null, () =>
    getGroupsByCategory(categoryId!),
  );
}

/** Contributions of the category, without blocked authors, with each author's name and photo. */
export async function loadCategoryLibrary(
  categoryId: string,
  uid: string | null,
): Promise<CategoryLibraryItem[]> {
  const [contributions, blockedIds] = await Promise.all([
    getContributionsByCategory(categoryId, 16),
    uid ? getBlockedUsers(uid).catch(() => []) : Promise.resolve<string[]>([]),
  ]);
  const blocked = new Set(blockedIds);
  const visible = contributions.filter((item) => !blocked.has(item.userId));
  const authors = Array.from(new Set(visible.map((item) => item.userId)));
  const profiles = new Map(
    await Promise.all(
      authors.map(async (authorId) => {
        try {
          return [authorId, await getUserProfile(authorId)] as const;
        } catch {
          return [authorId, null] as const;
        }
      }),
    ),
  );
  return visible.map((item) => {
    const profile = profiles.get(item.userId);
    return {
      ...item,
      authorName: profile?.displayName ?? profile?.username ?? 'Usuario',
      authorPhoto: profile?.photoURL ?? null,
    };
  });
}

/** The category's library, asked only once its tab is opened and kept for the session. */
export function useCategoryLibrary(
  categoryId: string | null,
  uid: string | null,
  enabled: boolean,
) {
  return useSessionResource(
    enabled && categoryId ? `category:${categoryId}:library:${uid ?? 'anon'}` : null,
    () => loadCategoryLibrary(categoryId!, uid),
  );
}
