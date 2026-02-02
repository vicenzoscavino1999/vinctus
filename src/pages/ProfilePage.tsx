import { useState, useEffect } from 'react';
import { Settings, MapPin, Mail, Edit3, Loader2, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserProfile, type UserProfileRead } from '../lib/firestore';
import EditProfileModal from '../components/EditProfileModal';
import CollectionsPanel from '../components/CollectionsPanel';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import ProfilePostsGrid from '@/features/posts/components/ProfilePostsGrid';
import ContributionsSection from '../components/ContributionsSection';
import { CATEGORIES } from '../data/mockData';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState<'profile' | 'collections'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfileRead | null>(null);
  const [profileLoadedUid, setProfileLoadedUid] = useState<string | null>(null);

  // Subscribe to user profile
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToUserProfile(
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

    return () => unsubscribe();
  }, [user]);

  const activeProfile = profile && user && profile.uid === user.uid ? profile : null;
  const loadingProfile = !!user && profileLoadedUid !== user.uid;

  // Display values (from profile or fallback to auth user)
  const displayName = activeProfile?.displayName || user?.displayName || 'Usuario';
  const email = activeProfile?.email || user?.email || '';
  const initial = displayName.charAt(0).toUpperCase();
  const photoURL = activeProfile?.photoURL || user?.photoURL || null;
  const role = activeProfile?.role || 'Nuevo miembro';
  const location = activeProfile?.location || 'Sin ubicación';
  const bio = activeProfile?.bio || '';
  const reputation = activeProfile?.reputation || 0;
  const karmaByInterest = activeProfile?.karmaByInterest ?? null;
  const postsCount = typeof activeProfile?.postsCount === 'number' ? activeProfile.postsCount : 0;
  const followersCount =
    typeof activeProfile?.followersCount === 'number' ? activeProfile.followersCount : 0;
  const followingCount =
    typeof activeProfile?.followingCount === 'number' ? activeProfile.followingCount : 0;
  const handleEditProfile = () => {
    setIsEditModalOpen(true);
  };

  const handleFollowListClick = (tab: 'followers' | 'following') => {
    if (!user) return;
    navigate(`/user/${user.uid}/connections?tab=${tab}`);
  };

  const handleProfileSaved = () => {
    showToast('Perfil actualizado', 'success');
  };

  const interestEntries = karmaByInterest
    ? Object.entries(karmaByInterest)
        .filter(([, value]) => typeof value === 'number' && value > 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 6)
    : [];

  const getInterestLabel = (interestId: string) => {
    const category = CATEGORIES.find((item) => item.id === interestId);
    return category?.label ?? interestId;
  };

  if (loadingProfile) {
    return (
      <div className="page-profile pt-8 max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Loader2 size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="page-profile pt-8 max-w-4xl mx-auto pb-32">
      {/* Profile Header */}
      <header className="flex items-start justify-between mb-12 pb-8 border-b border-neutral-900">
        <div className="flex items-center gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center text-3xl font-serif text-amber-500 overflow-hidden">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              initial
            )}
          </div>

          {/* Name and info */}
          <div>
            <h1 className="text-4xl font-serif font-light text-white mb-2">{displayName}</h1>
            <p className="text-neutral-400 mb-1">{role}</p>
            <p className="text-neutral-600 text-sm flex items-center">
              <MapPin size={12} className="mr-1" />
              {location}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="p-2.5 border border-neutral-700 text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors rounded-lg"
            aria-label="Configuración"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={handleEditProfile}
            className="flex items-center gap-2 px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm rounded-lg"
          >
            <Edit3 size={16} />
            Editar Perfil
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-10">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center min-w-0">
          <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">
            Publicaciones
          </div>
          <div className="text-lg font-semibold text-white mt-1">{postsCount}</div>
        </div>
        <button
          type="button"
          onClick={() => handleFollowListClick('followers')}
          className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center transition-colors hover:bg-neutral-800/40 min-w-0"
        >
          <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">
            Seguidores
          </div>
          <div className="text-lg font-semibold text-white mt-1">{followersCount}</div>
        </button>
        <button
          type="button"
          onClick={() => handleFollowListClick('following')}
          className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center transition-colors hover:bg-neutral-800/40 min-w-0"
        >
          <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">
            Siguiendo
          </div>
          <div className="text-lg font-semibold text-white mt-1">{followingCount}</div>
        </button>
      </div>

      <div className="mb-10">
        <StoriesWidget />
      </div>

      {/* Tabs: Mi Perfil | Colecciones */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
          <button
            onClick={() => setActiveSection('profile')}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeSection === 'profile'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Mi Perfil
          </button>
          <button
            onClick={() => setActiveSection('collections')}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeSection === 'collections'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <BookOpen size={16} />
            Colecciones
          </button>
        </div>
      </div>

      {/* Profile Section */}
      {activeSection === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Left column - About */}
          <div className="md:col-span-1 space-y-8">
            {/* About me */}
            <section>
              <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Sobre Mí</h2>
              {bio ? (
                <p className="text-neutral-400 font-light leading-relaxed">{bio}</p>
              ) : (
                <>
                  <p className="text-neutral-500 font-light leading-relaxed italic">
                    Aún no has añadido una biografía. ¡Cuéntale al mundo sobre ti!
                  </p>
                  <button
                    onClick={handleEditProfile}
                    className="mt-3 text-amber-500 text-sm hover:text-amber-400 transition-colors"
                  >
                    + Añadir biografía
                  </button>
                </>
              )}
            </section>

            {/* Reputation */}
            <section>
              <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">
                Reputación
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${reputation}%` }}
                  />
                </div>
                <span className="text-neutral-400 text-lg font-light">{reputation}</span>
              </div>
              <p className="text-neutral-600 text-xs mt-2">
                Contribuye para aumentar tu reputación
              </p>
              {interestEntries.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {interestEntries.map(([interestId, value]) => (
                    <span
                      key={interestId}
                      className="px-3 py-1.5 rounded-full border border-neutral-800/80 bg-neutral-900/40 text-xs text-neutral-300"
                    >
                      {getInterestLabel(interestId)} · {Math.round(value as number)}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Contact info */}
            <section>
              <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Contacto</h2>
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <Mail size={14} />
                <span>{email}</span>
              </div>
            </section>
          </div>

          {/* Right column - Posts + Portfolio */}
          <div className="md:col-span-2 space-y-10">
            <ProfilePostsGrid userId={user?.uid} canView={!!user} />

            <ContributionsSection userId={user?.uid} canEdit />
          </div>
        </div>
      )}

      {/* Collections Section */}
      {activeSection === 'collections' && <CollectionsPanel />}

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleProfileSaved}
      />
    </div>
  );
};

export default ProfilePage;
