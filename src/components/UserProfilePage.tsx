import { ChevronLeft, MapPin, BookOpen, UserPlus, Check, Clock, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
    getUserProfile,
    getFriendshipStatus,
    sendFriendRequest,
    acceptFriendRequest,
    cancelFriendRequest,
    type UserProfileRead
} from '../lib/firestore';

const UserProfilePage = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();

    const [profile, setProfile] = useState<UserProfileRead | null>(null);
    const [loading, setLoading] = useState(true);
    const [friendStatus, setFriendStatus] = useState<'none' | 'friends' | 'pending_sent' | 'pending_received'>('none');
    const [requestId, setRequestId] = useState<string | undefined>();
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

                // Get friendship status if logged in
                if (currentUser && userProfile) {
                    const status = await getFriendshipStatus(currentUser.uid, userId);
                    setFriendStatus(status.status);
                    setRequestId(status.requestId);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            } finally {
                setLoading(false);
            }
        };

        void loadProfile();
    }, [userId, currentUser]);

    const handleSendRequest = async () => {
        if (!currentUser || !userId) return;

        setActionLoading(true);
        try {
            await sendFriendRequest(
                currentUser.uid,
                userId,
                currentUser.displayName,
                currentUser.photoURL
            );
            setFriendStatus('pending_sent');
            showToast('Solicitud enviada', 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al enviar solicitud';
            showToast(message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!requestId) return;

        setActionLoading(true);
        try {
            await acceptFriendRequest(requestId);
            setFriendStatus('friends');
            showToast('¡Ahora son amigos!', 'success');
        } catch {
            showToast('Error al aceptar solicitud', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelRequest = async () => {
        if (!requestId) return;

        setActionLoading(true);
        try {
            await cancelFriendRequest(requestId);
            setFriendStatus('none');
            setRequestId(undefined);
            showToast('Solicitud cancelada', 'info');
        } catch {
            showToast('Error al cancelar solicitud', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const renderFriendButton = () => {
        if (!currentUser || currentUser.uid === userId) return null;

        switch (friendStatus) {
            case 'friends':
                return (
                    <span className="flex items-center gap-2 px-5 py-2.5 text-green-400 text-sm">
                        <Check size={16} />
                        Amigos
                    </span>
                );
            case 'pending_sent':
                return (
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
                );
            case 'pending_received':
                return (
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
                );
            default:
                return (
                    <button
                        onClick={handleSendRequest}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium hover:from-amber-400 hover:to-amber-500 transition-all text-sm disabled:opacity-50 rounded-lg"
                    >
                        {actionLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <>
                                <UserPlus size={16} />
                                Añadir amigo
                            </>
                        )}
                    </button>
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
                    {renderFriendButton()}
                </div>
            </header>

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

                {/* Right column - Portfolio */}
                <div className="md:col-span-2">
                    <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Portafolio & Contribuciones</h2>

                    <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                        <BookOpen size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
                        <p className="text-neutral-600 font-light italic">Sin contribuciones publicadas aún.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserProfilePage;
