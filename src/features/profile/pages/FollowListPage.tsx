import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, UserCheck, UserPlus } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui/Toast';
import {
  acceptFollowRequest,
  declineFollowRequest,
  getFollowList,
  getIncomingFollowRequests,
  getUserProfile,
  type FollowUserRead,
  type PaginatedResult,
  type UserProfileRead,
} from '@/lib/firestore';

type FollowTab = 'followers' | 'following';

const FOLLOW_PAGE_SIZE = 20;

const FollowListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as FollowTab | null;
  const activeTab: FollowTab = tabParam === 'following' ? 'following' : 'followers';
  const userId = routeUserId ?? user?.uid ?? '';

  const [profile, setProfile] = useState<UserProfileRead | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [items, setItems] = useState<FollowUserRead[]>([]);
  const [cursor, setCursor] = useState<PaginatedResult<FollowUserRead>['lastDoc']>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [requests, setRequests] = useState<Array<FollowUserRead & { requestId: string }>>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const isOwner = !!user && user.uid === userId;

  const title = useMemo(() => {
    if (!profile) return activeTab === 'followers' ? 'Seguidores' : 'Seguidos';
    return activeTab === 'followers'
      ? `Seguidores de ${profile.displayName ?? 'Usuario'}`
      : `Seguidos por ${profile.displayName ?? 'Usuario'}`;
  }, [profile, activeTab]);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;
    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const data = await getUserProfile(userId);
        if (isMounted) {
          setProfile(data);
        }
      } catch (profileError) {
        console.error('Error loading profile:', profileError);
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };
    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const loadList = async (reset = false) => {
    if (!userId) return;
    if (reset) {
      setLoading(true);
      setItems([]);
      setCursor(null);
      setHasMore(false);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const data = await getFollowList(
        userId,
        activeTab,
        FOLLOW_PAGE_SIZE,
        reset ? undefined : (cursor ?? undefined),
      );
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setCursor(data.lastDoc);
      setHasMore(data.hasMore);
    } catch (loadError) {
      console.error('Error loading follow list:', loadError);
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadList(true);
  }, [userId, activeTab]);

  const loadRequests = async () => {
    if (!userId || !isOwner || activeTab !== 'followers') return;
    setLoadingRequests(true);
    try {
      const data = await getIncomingFollowRequests(userId, 20);
      const mapped = data.items.map((item) => ({
        requestId: item.id,
        uid: item.fromUid,
        displayName: item.fromUser?.displayName ?? null,
        photoURL: item.fromUser?.photoURL ?? null,
        username: item.fromUser?.username ?? null,
      }));
      setRequests(mapped);
    } catch (reqError) {
      console.error('Error loading follow requests:', reqError);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [userId, activeTab, isOwner]);

  const handleAccept = async (requestId: string, fromUid: string) => {
    if (!userId) return;
    try {
      await acceptFollowRequest(fromUid, userId);
      setRequests((prev) => prev.filter((item) => item.requestId !== requestId));
      void loadList(true);
    } catch (error) {
      console.error('Error accepting follow request:', error);
      showToast('No se pudo aceptar la solicitud.', 'error');
    }
  };

  const handleDecline = async (requestId: string, fromUid: string) => {
    if (!userId) return;
    try {
      await declineFollowRequest(fromUid, userId);
      setRequests((prev) => prev.filter((item) => item.requestId !== requestId));
    } catch (error) {
      console.error('Error declining follow request:', error);
      showToast('No se pudo rechazar la solicitud.', 'error');
    }
  };

  const renderUserRow = (entry: FollowUserRead) => (
    <button
      key={entry.uid}
      onClick={() => navigate(`/user/${entry.uid}`)}
      className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-800 last:border-0 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3 text-left">
        <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center text-neutral-500 text-sm">
          {entry.photoURL ? (
            <img
              src={entry.photoURL}
              alt={entry.displayName ?? 'Usuario'}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{(entry.displayName ?? 'U').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div>
          <div className="text-sm text-white">{entry.displayName ?? 'Usuario'}</div>
          {entry.username && <div className="text-xs text-neutral-500">@{entry.username}</div>}
        </div>
      </div>
      <span className="text-xs text-neutral-500">
        {activeTab === 'followers' ? 'Seguidor' : 'Siguiendo'}
      </span>
    </button>
  );

  if (!userId) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-neutral-500">
        No se encontro el usuario.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 fade-in">
      <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/80 backdrop-blur-md py-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/5 rounded-full transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {!loadingProfile && profile && (
            <p className="text-xs text-neutral-500">
              {activeTab === 'followers' ? 'Personas que lo siguen' : 'Personas que sigue'}
            </p>
          )}
        </div>
      </header>

      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
          <button
            onClick={() => setSearchParams({ tab: 'followers' })}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === 'followers'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Seguidores
          </button>
          <button
            onClick={() => setSearchParams({ tab: 'following' })}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === 'following'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Seguidos
          </button>
        </div>
      </div>

      {isOwner && activeTab === 'followers' && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3 px-2">
            Solicitudes de seguimiento
          </h2>
          <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
            {loadingRequests ? (
              <div className="flex items-center justify-center py-6 text-neutral-500 text-sm">
                <Loader2 size={18} className="animate-spin mr-2" />
                Cargando solicitudes...
              </div>
            ) : requests.length === 0 ? (
              <div className="text-sm text-neutral-500 text-center py-6">
                No tienes solicitudes pendientes.
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.requestId}
                  className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center text-neutral-500 text-sm">
                      {req.photoURL ? (
                        <img
                          src={req.photoURL}
                          alt={req.displayName ?? 'Usuario'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{(req.displayName ?? 'U').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-white">{req.displayName ?? 'Usuario'}</div>
                      {req.username && (
                        <div className="text-xs text-neutral-500">@{req.username}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDecline(req.requestId, req.uid)}
                      className="px-3 py-1.5 text-xs rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleAccept(req.requestId, req.uid)}
                      className="px-3 py-1.5 text-xs rounded-full bg-amber-500 text-black hover:bg-amber-400 transition-colors flex items-center gap-1"
                    >
                      <UserCheck size={14} />
                      Aceptar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section>
        <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-neutral-500 text-sm">
              <Loader2 size={18} className="animate-spin mr-2" />
              Cargando...
            </div>
          ) : error ? (
            <div className="text-sm text-red-400 text-center py-10">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-neutral-500 text-center py-10 flex flex-col items-center gap-3">
              <UserPlus size={20} className="text-neutral-600" />
              {activeTab === 'followers' ? 'Aun no hay seguidores.' : 'Aun no sigues a nadie.'}
            </div>
          ) : (
            items.map(renderUserRow)
          )}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => void loadList(false)}
              disabled={loadingMore}
              className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingMore ? 'Cargando...' : 'Cargar mas'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default FollowListPage;
