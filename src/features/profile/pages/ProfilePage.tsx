import { useState, useEffect, useCallback } from 'react';
import { Settings, MapPin, Mail, Edit3, Loader2, BookOpen, Bookmark, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/shared/ui/Toast';
import { useAuth } from '@/context/auth';
import { useAppState } from '@/context/app-state';
import { subscribeToUserProfile, type UserProfileRead } from '@/features/profile/api';
import { getSavedArenaDebates } from '@/features/arena/api/queries';
import { unsaveArenaDebateWithSync } from '@/features/arena/api/mutations';
import { getPersonaById, type SavedArenaDebate } from '@/features/arena/types';
import EditProfileModal from '@/features/profile/components/EditProfileModal';
import CollectionsPanel from '@/features/collections/components/CollectionsPanel';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import ProfilePostsGrid from '@/features/posts/components/ProfilePostsGrid';
import ContributionsSection from '@/features/profile/components/ContributionsSection';
import { CATEGORIES } from '@/shared/constants';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { followedCategories, toggleFollowCategory } = useAppState();
  const userId = user?.uid ?? null;
  const [activeSection, setActiveSection] = useState<'profile' | 'collections'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfileRead | null>(null);
  const [profileLoadedUid, setProfileLoadedUid] = useState<string | null>(null);
  const [savedDebates, setSavedDebates] = useState<SavedArenaDebate[]>([]);
  const [loadingSavedDebates, setLoadingSavedDebates] = useState(false);
  const [savedDebatesError, setSavedDebatesError] = useState<string | null>(null);
  const [removingDebateId, setRemovingDebateId] = useState<string | null>(null);

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
  const loadingProfile = !!userId && profileLoadedUid !== userId;

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
    if (!userId) return;
    navigate(`/user/${userId}/connections?tab=${tab}`);
  };

  const handleProfileSaved = () => {
    showToast('Perfil actualizado', 'success');
  };

  const loadSavedDebates = useCallback(async () => {
    if (!userId) return;
    try {
      setSavedDebatesError(null);
      setLoadingSavedDebates(true);
      const data = await getSavedArenaDebates(userId, 20);
      setSavedDebates(data);
    } catch (savedError) {
      console.error('Error loading saved debates:', savedError);
      setSavedDebatesError('No se pudieron cargar tus debates guardados.');
    } finally {
      setLoadingSavedDebates(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSavedDebates([]);
      setSavedDebatesError(null);
      return;
    }
    void loadSavedDebates();
  }, [userId, loadSavedDebates]);

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
  const followedCategoryItems = followedCategories
    .map((categoryId) => CATEGORIES.find((category) => category.id === categoryId))
    .filter((category): category is (typeof CATEGORIES)[number] => Boolean(category));

  const formatSavedDate = (value: unknown): string => {
    if (!value) return 'Reciente';
    if (value instanceof Date) {
      return value.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (typeof value === 'object' && value && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return 'Reciente';
  };

  const handleRemoveSavedDebate = async (debateId: string) => {
    if (!userId) return;
    try {
      setRemovingDebateId(debateId);
      await unsaveArenaDebateWithSync(debateId, userId);
      setSavedDebates((prev) => prev.filter((item) => item.debateId !== debateId));
      showToast('Debate eliminado de guardados', 'success');
    } catch (removeError) {
      console.error('Error removing saved debate:', removeError);
      showToast('No se pudo eliminar el debate guardado', 'error');
    } finally {
      setRemovingDebateId(null);
    }
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

            <section>
              <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">
                Categorias Seguidas
              </h2>
              {followedCategoryItems.length === 0 ? (
                <p className="text-neutral-500 text-sm">
                  Aun no sigues categorias. Desde Discover puedes seguir las que te interesen.
                </p>
              ) : (
                <div className="space-y-2">
                  {followedCategoryItems.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800/80 bg-neutral-900/40 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/category/${category.id}`)}
                        className="flex items-center gap-2 text-neutral-200 hover:text-white transition-colors min-w-0"
                      >
                        <category.icon size={14} className={category.color} />
                        <span className="text-sm truncate">{category.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleFollowCategory(category.id);
                          showToast('Categoria dejada de seguir', 'info');
                        }}
                        className="text-[10px] uppercase tracking-wider text-neutral-400 hover:text-brand-gold transition-colors"
                      >
                        Dejar
                      </button>
                    </div>
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
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Bookmark size={16} className="text-brand-gold" />
                <h2 className="text-xs tracking-[0.2em] text-neutral-500 uppercase">
                  Debates Guardados
                </h2>
              </div>

              {loadingSavedDebates ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 size={14} className="animate-spin" />
                  Cargando debates guardados...
                </div>
              ) : savedDebatesError ? (
                <p className="text-sm text-red-400">{savedDebatesError}</p>
              ) : savedDebates.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Aun no tienes debates guardados. Desde Arena IA puedes guardarlos con un clic.
                </p>
              ) : (
                <div className="space-y-3">
                  {savedDebates.map((savedDebate) => {
                    const personaAName = getPersonaById(savedDebate.personaA)?.name || 'Persona A';
                    const personaBName = getPersonaById(savedDebate.personaB)?.name || 'Persona B';
                    const summaryPreview =
                      typeof savedDebate.summary === 'string' && savedDebate.summary.length > 180
                        ? `${savedDebate.summary.slice(0, 180)}...`
                        : savedDebate.summary;

                    return (
                      <article
                        key={savedDebate.debateId}
                        className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4"
                      >
                        <h3 className="text-white font-medium">{savedDebate.topic}</h3>
                        <p className="mt-1 text-xs text-neutral-500">
                          {personaAName} vs {personaBName} ·{' '}
                          {formatSavedDate(savedDebate.createdAt)}
                        </p>
                        {summaryPreview && (
                          <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                            {summaryPreview}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/arena/${savedDebate.debateId}`)}
                            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                          >
                            Ver debate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSavedDebate(savedDebate.debateId)}
                            disabled={removingDebateId === savedDebate.debateId}
                            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-400 transition hover:border-red-500/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {removingDebateId === savedDebate.debateId ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            Quitar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

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
