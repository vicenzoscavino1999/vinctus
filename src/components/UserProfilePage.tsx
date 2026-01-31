import { ChevronLeft, MapPin, BookOpen, UserPlus, UserCheck, Check, Clock, Loader2, MessageCircle, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
    getUserProfile,
    getFollowStatus,
    getAccountVisibilityServer,
    sendFollowRequest,
    acceptFollowRequest,
    declineFollowRequest,
    cancelFollowRequest,
    followPublicUser,
    unfollowUser,
    getOrCreateDirectConversation,
    isUserBlocked,
    type FollowStatus,
    type UserProfileRead
} from '../lib/firestore';
import ProfilePostsGrid from './ProfilePostsGrid';

const UserProfilePage = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();

    const [profile, setProfile] = useState<UserProfileRead | null>(null);
    const [loading, setLoading] = useState(true);
    const [followStatus, setFollowStatus] = useState<FollowStatus>('none');
    const [isMutual, setIsMutual] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Load user profile
    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const loadProfile = async () => {
            setLoading(true);
            try {
                const userProfile = await getUserProfile(userId);
                setProfile(userProfile);

                // Get follow status if logged in
                if (currentUser && userProfile) {
                    const status = await getFollowStatus(currentUser.uid, userId, userProfile.accountVisibility);
                    let nextStatus = status.status;
                    if (userProfile.accountVisibility !== 'private'
                        && (nextStatus === 'pending_sent' || nextStatus === 'pending_received')) {
                        nextStatus = 'none';
                    }
                    setFollowStatus(nextStatus);
                    setIsMutual(!!status.isMutual);
                } else {
                    setFollowStatus('none');
                    setIsMutual(false);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            } finally {
                setLoading(false);
            }
        };

        void loadProfile();
    }, [userId, currentUser]);

    const handleFollow = async () => {
        if (!currentUser || !userId || !profile) return;

        try {
            const blocked = await isUserBlocked(currentUser.uid, userId);
            if (blocked) {
                showToast('Desbloquea a este usuario para poder seguirlo', 'info');
                return;
            }
        } catch (err) {
            console.error('Error checking block status:', err);
        }

        setActionLoading(true);
        try {
            const visibility = await getAccountVisibilityServer(userId);
            if (visibility !== profile.accountVisibility) {
                setProfile((prev) => (prev ? { ...prev, accountVisibility: visibility } : prev));
            }
            if (visibility === 'private') {
                try {
                    await sendFollowRequest(currentUser.uid, userId);
                    setFollowStatus('pending_sent');
                    showToast('Solicitud enviada', 'success');
                } catch (err) {
                    const code = (err as { code?: string })?.code;
                    if (code === 'permission-denied') {
                        await followPublicUser(currentUser.uid, userId);
                        const status = await getFollowStatus(currentUser.uid, userId, 'public');
                        setFollowStatus(status.status);
                        setIsMutual(!!status.isMutual);
                        showToast('Siguiendo', 'success');
                    } else {
                        throw err;
                    }
                }
            } else {
                try {
                    await Promise.allSettled([
                        cancelFollowRequest(currentUser.uid, userId)
                    ]);
                    await followPublicUser(currentUser.uid, userId);
                    const status = await getFollowStatus(currentUser.uid, userId, visibility);
                    setFollowStatus(status.status);
                    setIsMutual(!!status.isMutual);
                    showToast('Siguiendo', 'success');
                } catch (err) {
                    const code = (err as { code?: string })?.code;
                    if (code === 'permission-denied') {
                        const fallbackVisibility = await getAccountVisibilityServer(userId);
                        if (fallbackVisibility === 'private') {
                            await sendFollowRequest(currentUser.uid, userId);
                            setFollowStatus('pending_sent');
                            setIsMutual(false);
                            showToast('Solicitud enviada', 'success');
                        } else {
                            throw err;
                        }
                    } else {
                        throw err;
                    }
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al seguir usuario';
            showToast(message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            await acceptFollowRequest(userId, currentUser.uid);
            setFollowStatus('none');
            setIsMutual(false);
            showToast('Solicitud aceptada', 'success');
        } catch {
            showToast('Error al aceptar solicitud', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeclineRequest = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            await declineFollowRequest(userId, currentUser.uid);
            setFollowStatus('none');
            showToast('Solicitud rechazada', 'info');
        } catch {
            showToast('Error al rechazar solicitud', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelRequest = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            await cancelFollowRequest(currentUser.uid, userId);
            setFollowStatus('none');
            setIsMutual(false);
            showToast('Solicitud cancelada', 'info');
        } catch {
            showToast('Error al cancelar solicitud', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnfollow = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            await unfollowUser(currentUser.uid, userId);
            setFollowStatus('none');
            setIsMutual(false);
            showToast('Dejaste de seguir', 'info');
        } catch {
            showToast('Error al dejar de seguir', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            const blocked = await isUserBlocked(currentUser.uid, userId);
            if (blocked) {
                showToast('Desbloquea a este usuario para enviarle mensajes', 'info');
                return;
            }
            const conversationId = await getOrCreateDirectConversation(currentUser.uid, userId);
            navigate(`/messages?conversation=${conversationId}`);
        } catch {
            showToast('Error al crear conversación', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const renderFollowActions = () => {
        if (!currentUser || currentUser.uid === userId) return null;

        const isPrivate = profile?.accountVisibility === 'private';
        const canMessage = !isPrivate || isMutual || followStatus === 'following';
        const messageButton = canMessage ? (
            <button
                onClick={handleSendMessage}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700 transition-colors text-sm disabled:opacity-50 rounded-lg"
            >
                <MessageCircle size={16} />
                Mensaje
            </button>
        ) : null;

        switch (followStatus) {
            case 'following':
                return (
                    <>
                        {messageButton}
                        <button
                            onClick={handleUnfollow}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm disabled:opacity-50 rounded-lg"
                        >
                            {actionLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <UserCheck size={16} />
                                    Siguiendo
                                </>
                            )}
                        </button>
                    </>
                );
            case 'pending_sent':
                return (
                    <>
                        {messageButton}
                        <button
                            onClick={handleCancelRequest}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-5 py-2.5 border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition-colors text-sm disabled:opacity-50 rounded-lg"
                        >
                            {actionLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <Clock size={16} />
                                    Pendiente
                                </>
                            )}
                        </button>
                    </>
                );
            case 'pending_received':
                return (
                    <>
                        {messageButton}
                        <button
                            onClick={handleAcceptRequest}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 transition-colors text-sm disabled:opacity-50 rounded-lg"
                        >
                            {actionLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <Check size={16} />
                                    Aceptar solicitud
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleDeclineRequest}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-5 py-2.5 border border-neutral-700 text-neutral-300 hover:bg-neutral-900 transition-colors text-sm disabled:opacity-50 rounded-lg"
                        >
                            {actionLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <X size={16} />
                                    Rechazar
                                </>
                            )}
                        </button>
                    </>
                );
            default:
                return (
                    <>
                        {messageButton}
                        <button
                            onClick={handleFollow}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium hover:from-amber-400 hover:to-amber-500 transition-all text-sm disabled:opacity-50 rounded-lg"
                        >
                            {actionLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <UserPlus size={16} />
                                    Seguir
                                </>
                            )}
                        </button>
                    </>
                );
        }
    };

    if (loading) {
        return (
            <div className="page-profile flex items-center justify-center h-[60vh]">
                <Loader2 size={32} className="animate-spin text-amber-500" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="page-profile flex flex-col items-center justify-center h-[60vh] text-neutral-600">
                <p className="font-serif italic text-lg mb-4">Usuario no encontrado</p>
                <button onClick={() => navigate(-1)} className="text-white underline text-sm">Volver</button>
            </div>
        );
    }

    const initial = profile.displayName?.charAt(0).toUpperCase() || '?';
    const isOwner = currentUser?.uid === userId;
    const isPrivate = profile.accountVisibility === 'private';
    const canViewPrivateContent = !isPrivate || isOwner || isMutual || followStatus === 'following';
    const canViewFollowLists = !isPrivate || isOwner || isMutual || followStatus === 'following';
    const postsCount = typeof profile.postsCount === 'number' ? profile.postsCount : 0;
    const followersCount = typeof profile.followersCount === 'number' ? profile.followersCount : 0;
    const followingCount = typeof profile.followingCount === 'number' ? profile.followingCount : 0;

    const handleFollowListClick = (tab: 'followers' | 'following') => {
        if (!userId) return;
        if (!canViewFollowLists) {
            showToast('Esta cuenta es privada', 'info');
            return;
        }
        navigate(`/user/${userId}/connections?tab=${tab}`);
    };

    return (
        <div className="page-profile pt-8 max-w-4xl mx-auto pb-20">
            {/* Back button */}
            <button
                onClick={() => navigate(-1)}
                className="group flex items-center text-neutral-500 hover:text-neutral-300 mb-8 transition-colors text-xs tracking-widest uppercase"
            >
                <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                Volver
            </button>

            {/* Profile header */}
            <header className="flex flex-col md:flex-row items-start justify-between mb-12 pb-8 border-b border-neutral-900 gap-6">
                <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center text-3xl font-serif text-amber-500 overflow-hidden">
                        {profile.photoURL ? (
                            <img src={profile.photoURL} alt={profile.displayName || 'Usuario'} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            initial
                        )}
                    </div>

                    {/* Name and info */}
                    <div>
                        <h1 className="text-3xl md:text-4xl font-serif font-light text-white mb-2">
                            {profile.displayName || 'Usuario'}
                        </h1>
                        <p className="text-neutral-400 mb-1">{profile.role || 'Nuevo miembro'}</p>
                        <p className="text-neutral-600 text-sm flex items-center">
                            <MapPin size={12} className="mr-1" />
                            {profile.location || 'Sin ubicación'}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                    {renderFollowActions()}
                </div>
            </header>

            <div className="grid grid-cols-3 gap-2 mb-10">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center min-w-0">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">Publicaciones</div>
                    <div className="text-lg font-semibold text-white mt-1">{postsCount}</div>
                </div>
                <button
                    type="button"
                    onClick={() => handleFollowListClick('followers')}
                    disabled={!canViewFollowLists}
                    className={`rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center transition-colors min-w-0 ${canViewFollowLists ? 'hover:bg-neutral-800/40' : 'opacity-60 cursor-not-allowed'}`}
                >
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">Seguidores</div>
                    <div className="text-lg font-semibold text-white mt-1">{followersCount}</div>
                </button>
                <button
                    type="button"
                    onClick={() => handleFollowListClick('following')}
                    disabled={!canViewFollowLists}
                    className={`rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 sm:px-4 py-3 text-center transition-colors min-w-0 ${canViewFollowLists ? 'hover:bg-neutral-800/40' : 'opacity-60 cursor-not-allowed'}`}
                >
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest text-neutral-500 truncate">Siguiendo</div>
                    <div className="text-lg font-semibold text-white mt-1">{followingCount}</div>
                </button>
            </div>

            {/* Content grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Left column - About */}
                <div className="md:col-span-1 space-y-8">
                    {/* About me */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Sobre Mí</h2>
                        {profile.bio ? (
                            <p className="text-neutral-400 font-light leading-relaxed">{profile.bio}</p>
                        ) : (
                            <p className="text-neutral-600 font-light italic">Sin biografía aún.</p>
                        )}
                    </section>

                    {/* Reputation */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Reputación</h2>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                                    style={{ width: `${profile.reputation || 0}%` }}
                                />
                            </div>
                            <span className="text-neutral-400 text-lg font-light">{profile.reputation || 0}</span>
                        </div>
                    </section>

                    {/* Member since */}
                    <section>
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Miembro desde</h2>
                        <p className="text-neutral-400 text-sm">
                            {profile.createdAt?.toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'long'
                            }) || 'Fecha desconocida'}
                        </p>
                    </section>
                </div>

                {/* Right column - Posts + Portfolio */}
                <div className="md:col-span-2">
                    {canViewPrivateContent ? (
                        <div className="space-y-10">
                            <ProfilePostsGrid userId={profile.uid} canView={canViewPrivateContent} />

                            <div>
                                <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Portafolio & Contribuciones</h2>

                                <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                                    <BookOpen size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
                                    <p className="text-neutral-600 font-light italic">Sin contribuciones publicadas a??n.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                            <p className="text-white text-lg font-light mb-2">Cuenta privada</p>
                            <p className="text-neutral-500 text-sm">
                                Sigue a este usuario para ver sus publicaciones.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserProfilePage;
