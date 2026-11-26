import { useEffect, useState } from 'react';
import { BookOpen, Bookmark, Loader2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/shared/ui/Toast';
import { useAuth } from '@/context/auth';
import { useAppState } from '@/context/app-state';
import { subscribeToUserProfile, type UserProfileRead } from '@/features/profile/api';
import EditProfileModal from '@/features/profile/components/EditProfileModal';
import OwnProfileHeader from '@/features/profile/components/OwnProfileHeader';
import ProfileStats from '@/features/profile/components/ProfileStats';
import ProfileAboutAside from '@/features/profile/components/ProfileAboutAside';
import SavedDebatesSection from '@/features/profile/components/SavedDebatesSection';
import ContributionsSection from '@/features/profile/components/ContributionsSection';
import CollectionsPanel from '@/features/collections/components/CollectionsPanel';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import ProfilePostsGrid from '@/features/posts/components/ProfilePostsGrid';
import SavedPostsPanel from '@/features/posts/components/SavedPostsPanel';

type Section = 'profile' | 'saved' | 'collections';

const SECTIONS: Array<{ id: Section; label: string; icon: typeof BookOpen }> = [
  { id: 'profile', label: 'Mi Perfil', icon: UserRound },
  { id: 'saved', label: 'Guardados', icon: Bookmark },
  { id: 'collections', label: 'Colecciones', icon: BookOpen },
];

const count = (value: unknown) => (typeof value === 'number' ? value : 0);

/**
 * Your own profile: header with the bio, counters, stories, then "Mi Perfil" (your posts and
 * portfolio first, reputation, categories and contact beside them), "Guardados" (saved posts and
 * debates) and "Colecciones".
 */
const ProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { followedCategories, toggleFollowCategory } = useAppState();
  const userId = user?.uid ?? null;
  const [section, setSection] = useState<Section>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<UserProfileRead | null>(null);
  const [profileLoadedUid, setProfileLoadedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserProfile(
      user.uid,
      (profileData) => {
        setProfile(profileData);
        setProfileLoadedUid(user.uid);
      },
      (error) => {
        console.error('Error loading profile:', error);
        setProfileLoadedUid(user.uid);
      },
    );
  }, [user]);

  if (userId && profileLoadedUid !== userId) {
    return (
      <div className="page-profile mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center pt-8">
        <Loader2 size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  const current = profile && user && profile.uid === user.uid ? profile : null;
  const displayName = current?.displayName || user?.displayName || 'Usuario';
  const openFollowList = (tab: 'followers' | 'following') => {
    if (userId) navigate(`/user/${userId}/connections?tab=${tab}`);
  };

  return (
    <div className="page-profile mx-auto max-w-4xl pb-32 pt-8">
      <OwnProfileHeader
        displayName={displayName}
        photoURL={current?.photoURL || user?.photoURL || null}
        role={current?.role || 'Nuevo miembro'}
        location={current?.location || ''}
        bio={current?.bio || ''}
        onEdit={() => setIsEditing(true)}
        onOpenSettings={() => navigate('/settings')}
      />

      <div className="mt-8">
        <ProfileStats
          posts={count(current?.postsCount)}
          followers={count(current?.followersCount)}
          following={count(current?.followingCount)}
          onOpenFollowers={() => openFollowList('followers')}
          onOpenFollowing={() => openFollowList('following')}
        />
      </div>

      <div className="mt-10">
        <StoriesWidget />
      </div>

      <div className="mb-8 mt-10 flex justify-center">
        <div
          role="tablist"
          aria-label="Secciones del perfil"
          className="inline-flex rounded-full border border-neutral-800 bg-neutral-900/30 p-1"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all sm:px-6 ${
                section === id
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Icon size={16} className="hidden sm:block" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {section === 'profile' && (
        // Phones: your posts first, the details after them. Wide screens: details on the left.
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="space-y-12 md:col-span-2 md:order-2">
            <ProfilePostsGrid userId={userId ?? undefined} canView={!!user} />
            <ContributionsSection userId={userId ?? undefined} canEdit />
          </div>
          <div className="md:order-1">
            <ProfileAboutAside
              reputation={current?.reputation || 0}
              karmaByInterest={current?.karmaByInterest ?? null}
              followedCategories={followedCategories}
              email={current?.email || user?.email || ''}
              onUnfollowCategory={(category) => {
                toggleFollowCategory(category.id);
                showToast('Categoría dejada de seguir', 'info');
              }}
            />
          </div>
        </div>
      )}

      {section === 'saved' && userId && (
        <div className="space-y-8">
          <SavedPostsPanel key={userId} uid={userId} />
          <SavedDebatesSection userId={userId} />
        </div>
      )}

      {section === 'collections' && <CollectionsPanel />}

      {isEditing && (
        <EditProfileModal
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          onSave={() => showToast('Perfil actualizado', 'success')}
        />
      )}
    </div>
  );
};

export default ProfilePage;
