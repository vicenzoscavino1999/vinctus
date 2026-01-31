import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User as UserIcon, Users, AlertCircle, Loader2, Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import {
    getUserProfile,
    getConversationMember,
    setConversationMute,
    clearConversationMute,
    blockUser,
    unblockUser,
    isUserBlocked,
    createUserReport,
    type UserProfileRead,
    type ConversationMemberRead,
    type UserReportReason
} from '../lib/firestore';
import CreateGroupModal from '../components/CreateGroupModal';

// Helper to parse otherUserId from conversation ID
const parseOtherUserId = (conversationId: string, currentUid: string): string | null => {
    if (!conversationId.startsWith('dm_')) return null;
    const parts = conversationId.slice(3).split('_');
    if (parts.length < 2) return null;

    // Find the ID that is not the current user
    const otherId = parts.find(id => id !== currentUid);
    return otherId ?? null;
};

const REPORT_REASON_OPTIONS: Array<{ value: UserReportReason; label: string }> = [
    { value: 'spam', label: 'Spam o publicidad' },
    { value: 'harassment', label: 'Acoso' },
    { value: 'abuse', label: 'Abuso' },
    { value: 'fake', label: 'Suplantacion' },
    { value: 'other', label: 'Otro' }
];

export default function ConversationDetailsPage() {
    const navigate = useNavigate();
    const { conversationId } = useParams<{ conversationId: string }>();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [otherUserProfile, setOtherUserProfile] = useState<UserProfileRead | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState<UserReportReason>('spam');
    const [reportDetails, setReportDetails] = useState('');
    const [reportError, setReportError] = useState<string | null>(null);
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [isBlocking, setIsBlocking] = useState(false);

    // Mute state
    const [memberData, setMemberData] = useState<ConversationMemberRead | null>(null);
    const [showMuteModal, setShowMuteModal] = useState(false);
    const [isTogglingMute, setIsTogglingMute] = useState(false);

    useEffect(() => {
        // Guard 1: Wait for auth
        if (!user?.uid) {
            setLoading(true);
            return;
        }

        // Guard 2: Validate conversationId format
        if (!conversationId || !conversationId.startsWith('dm_')) {
            console.error('[ConversationDetailsPage] Invalid conversationId format:', conversationId);
            navigate('/messages', { replace: true });
            return;
        }

        // Parse otherUserId
        const otherId = parseOtherUserId(conversationId, user.uid);

        // Guard 3: Validate otherUserId was parsed successfully
        if (!otherId) {
            console.error('[ConversationDetailsPage] Could not parse otherUserId from:', conversationId);
            setError('No se pudo identificar al usuario.');
            setLoading(false);
            return;
        }

        // Load other user's public profile
        const loadProfile = async () => {
            try {
                setLoading(true);
                setError(null);
                const profile = await getUserProfile(otherId);

                if (!profile) {
                    setError('Usuario no encontrado.');
                    return;
                }

                setOtherUserProfile(profile);
            } catch (err) {
                console.error('[ConversationDetailsPage] Error loading profile:', err);
                setError('No se pudo cargar el perfil del usuario.');
            } finally {
                setLoading(false);
            }
        };

        void loadProfile();
    }, [conversationId, user, navigate]);

    // Load member data for mute state
    useEffect(() => {
        if (!conversationId || !user?.uid) return;

        const loadMemberData = async () => {
            try {
                const member = await getConversationMember(conversationId, user.uid);
                if (member) {
                    // Auto-unmute if mutedUntil has passed
                    if (member.muted && member.mutedUntil && member.mutedUntil < new Date()) {
                        await clearConversationMute(conversationId, user.uid);
                        setMemberData({ ...member, muted: false, mutedUntil: null });
                    } else {
                        setMemberData(member);
                    }
                }
            } catch (err) {
                console.error('[ConversationDetailsPage] Error loading member data:', err);
            }
        };

        void loadMemberData();
    }, [conversationId, user]);

    useEffect(() => {
        if (!user?.uid || !otherUserProfile) return;
        const loadBlockStatus = async () => {
            try {
                const blocked = await isUserBlocked(user.uid, otherUserProfile.uid);
                setIsBlocked(blocked);
            } catch (err) {
                console.error('[ConversationDetailsPage] Error loading block status:', err);
            }
        };
        void loadBlockStatus();
    }, [user, otherUserProfile]);

    const handleGoBack = () => {
        navigate('/messages');
    };

    const handleViewProfile = () => {
        if (!otherUserProfile) return;
        // Use /user/:userId route (confirmed in AppLayout line 206)
        navigate(`/user/${otherUserProfile.uid}`);
    };

    // Mute handlers
    const handleMute = async (hours: number | null) => {
        if (!conversationId || !user?.uid) return;
        setIsTogglingMute(true);
        try {
            const mutedUntil = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
            await setConversationMute(conversationId, user.uid, mutedUntil);
            setMemberData(prev => prev ? { ...prev, muted: true, mutedUntil } : null);
            setShowMuteModal(false);
        } catch (err) {
            console.error('[ConversationDetailsPage] Error muting:', err);
        } finally {
            setIsTogglingMute(false);
        }
    };

    const handleUnmute = async () => {
        if (!conversationId || !user?.uid) return;
        setIsTogglingMute(true);
        try {
            await clearConversationMute(conversationId, user.uid);
            setMemberData(prev => prev ? { ...prev, muted: false, mutedUntil: null } : null);
        } catch (err) {
            console.error('[ConversationDetailsPage] Error unmuting:', err);
        } finally {
            setIsTogglingMute(false);
        }
    };

    const resetReportForm = () => {
        setReportReason('spam');
        setReportDetails('');
        setReportError(null);
    };

    const handleSubmitReport = async () => {
        if (!user?.uid || !otherUserProfile) return;
        setIsSubmittingReport(true);
        setReportError(null);
        try {
            await createUserReport({
                reporterUid: user.uid,
                reportedUid: otherUserProfile.uid,
                reason: reportReason,
                details: reportDetails.trim() ? reportDetails.trim() : null,
                conversationId: conversationId ?? null
            });
            showToast('Reporte enviado', 'success');
            setShowReportModal(false);
            resetReportForm();
        } catch (err) {
            console.error('[ConversationDetailsPage] Error creating report:', err);
            setReportError('No se pudo enviar el reporte.');
        } finally {
            setIsSubmittingReport(false);
        }
    };

    const handleToggleBlock = async () => {
        if (!user?.uid || !otherUserProfile) return;
        setIsBlocking(true);
        try {
            if (isBlocked) {
                await unblockUser(user.uid, otherUserProfile.uid);
                setIsBlocked(false);
                showToast('Usuario desbloqueado', 'success');
            } else {
                await blockUser(user.uid, otherUserProfile.uid);
                setIsBlocked(true);
                showToast('Usuario bloqueado', 'success');
                navigate('/messages');
            }
        } catch (err) {
            console.error('[ConversationDetailsPage] Error toggling block:', err);
            showToast('No se pudo completar la accion', 'error');
        } finally {
            setIsBlocking(false);
            setShowBlockModal(false);
        }
    };

    // Helper: format mute status text
    const getMuteStatusText = () => {
        if (!memberData?.muted) return null;
        if (!memberData.mutedUntil) return 'Silenciado';
        const now = new Date();
        if (memberData.mutedUntil <= now) return null;
        return `Silenciado hasta ${memberData.mutedUntil.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
    };

    // Loading state
    if (loading) {
        return (
            <div className="page-feed pt-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500" size={32} />
                </div>
            </div>
        );
    }

    // Error state
    if (error || !otherUserProfile) {
        return (
            <div className="page-feed pt-6 max-w-3xl mx-auto">
                <div className="flex flex-col items-center justify-center py-20">
                    <AlertCircle className="text-red-400 mb-4" size={48} />
                    <p className="text-neutral-400 mb-6">{error || 'Usuario no encontrado.'}</p>
                    <button
                        onClick={handleGoBack}
                        className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
                    >
                        Volver a Mensajes
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-feed pt-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button
                    type="button"
                    onClick={handleGoBack}
                    aria-label="Volver a mensajes"
                    className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-serif font-light text-white">Detalles del Chat</h1>
            </div>

            {/* User Info */}
            <div className="flex flex-col items-center py-8 border-b border-neutral-800/50">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-700 mb-4">
                    {otherUserProfile.photoURL ? (
                        <img
                            src={otherUserProfile.photoURL}
                            alt={otherUserProfile.displayName || 'Usuario'}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <UserIcon size={40} className="text-neutral-600" />
                        </div>
                    )}
                </div>
                <h2 className="text-xl font-medium text-white mb-1">
                    {otherUserProfile.displayName || 'Usuario'}
                </h2>
                {otherUserProfile.username && (
                    <p className="text-sm text-neutral-500">@{otherUserProfile.username}</p>
                )}
            </div>

            {/* Actions */}
            <div className="mt-8 space-y-2">
                {/* View Profile - Active */}
                <button
                    type="button"
                    onClick={handleViewProfile}
                    className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <UserIcon size={18} className="text-amber-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-white font-medium">Ver perfil</p>
                        <p className="text-xs text-neutral-500">Ver el perfil público de este usuario</p>
                    </div>
                </button>

                {/* Create Group - Active (Fase 2) */}
                <button
                    type="button"
                    onClick={() => setShowCreateGroupModal(true)}
                    className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Users size={18} className="text-amber-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-white font-medium">Crear grupo con esta persona</p>
                        <p className="text-xs text-neutral-500">Iniciar un nuevo grupo juntos</p>
                    </div>
                </button>

                {/* Mute - Active */}
                {memberData?.muted ? (
                    <button
                        type="button"
                        onClick={handleUnmute}
                        disabled={isTogglingMute}
                        className="w-full flex items-center gap-4 p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
                    >
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                            <BellOff size={18} className="text-amber-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-amber-400 font-medium">Quitar silencio</p>
                            <p className="text-xs text-amber-600">{getMuteStatusText()}</p>
                        </div>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowMuteModal(true)}
                        disabled={isTogglingMute}
                        className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
                    >
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                            <Bell size={18} className="text-amber-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-white font-medium">Silenciar</p>
                            <p className="text-xs text-neutral-500">No recibir notificaciones de este chat</p>
                        </div>
                    </button>
                )}

                {/* Block - Active */}
                <button
                    type="button"
                    onClick={() => setShowBlockModal(true)}
                    className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-red-500/10 border border-neutral-800/50 hover:border-red-500/30 rounded-xl transition-all text-left cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-400 text-lg">{isBlocked ? '?' : '??'}</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-white font-medium">{isBlocked ? 'Desbloquear' : 'Bloquear'}</p>
                        <p className="text-xs text-neutral-500">
                            {isBlocked ? 'Permitir mensajes y seguir de nuevo' : 'No podras ver sus mensajes ni posts'}
                        </p>
                    </div>
                </button>

                {/* Report - Active */}
                <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-red-500/10 border border-neutral-800/50 hover:border-red-500/30 rounded-xl transition-all text-left cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={18} className="text-red-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-white font-medium">Reportar</p>
                        <p className="text-xs text-neutral-500">Reportar este usuario</p>
                    </div>
                </button>

            </div>

            {/* Create Group Modal */}
            <CreateGroupModal
                isOpen={showCreateGroupModal}
                onClose={() => setShowCreateGroupModal(false)}
                onCreated={(groupId) => {
                    setShowCreateGroupModal(false);
                    navigate(`/group/${groupId}`);
                }}
                preselectedMemberProfiles={otherUserProfile ? [otherUserProfile] : []}
            />

            {/* Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => {
                            setShowReportModal(false);
                            resetReportForm();
                        }}
                    />
                    <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                            <h3 className="text-lg font-medium text-white">Reportar usuario</h3>
                            <button
                                onClick={() => {
                                    setShowReportModal(false);
                                    resetReportForm();
                                }}
                                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Motivo
                                </label>
                                <select
                                    value={reportReason}
                                    onChange={(event) => setReportReason(event.target.value as UserReportReason)}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500/50 transition-colors"
                                >
                                    {REPORT_REASON_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Detalles (opcional)
                                </label>
                                <textarea
                                    value={reportDetails}
                                    onChange={(event) => setReportDetails(event.target.value)}
                                    rows={4}
                                    maxLength={2000}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/50 transition-colors resize-none"
                                    placeholder="Describe el motivo del reporte"
                                />
                                <div className="text-right text-xs text-neutral-500 mt-1">
                                    {reportDetails.length}/2000
                                </div>
                            </div>

                            {reportError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    {reportError}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowReportModal(false);
                                        resetReportForm();
                                    }}
                                    className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmitReport}
                                    disabled={isSubmittingReport}
                                    className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmittingReport ? 'Enviando...' : 'Enviar reporte'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Block Modal */}
            {showBlockModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setShowBlockModal(false)}
                    />
                    <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                            <h3 className="text-lg font-medium text-white">
                                {isBlocked ? 'Desbloquear usuario' : 'Bloquear usuario'}
                            </h3>
                            <button
                                onClick={() => setShowBlockModal(false)}
                                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-sm text-neutral-400">
                                {isBlocked
                                    ? 'Podran volver a enviarse mensajes y seguirse.'
                                    : 'No podras enviar ni recibir mensajes. Dejaran de seguirse automaticamente y no veras sus publicaciones.'}
                            </p>
                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowBlockModal(false)}
                                    className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleToggleBlock}
                                    disabled={isBlocking}
                                    className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isBlocked
                                            ? 'bg-amber-500 hover:bg-amber-600 text-black'
                                            : 'bg-red-500 hover:bg-red-600 text-white'
                                    }`}
                                >
                                    {isBlocking ? 'Procesando...' : (isBlocked ? 'Desbloquear' : 'Bloquear')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mute Options Modal */}
            {showMuteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMuteModal(false)} />
                    <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                            <h3 className="text-lg font-medium text-white">Silenciar conversación</h3>
                            <button
                                onClick={() => setShowMuteModal(false)}
                                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-2">
                            <button
                                onClick={() => handleMute(1)}
                                disabled={isTogglingMute}
                                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                                1 hora
                            </button>
                            <button
                                onClick={() => handleMute(4)}
                                disabled={isTogglingMute}
                                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                                4 horas
                            </button>
                            <button
                                onClick={() => handleMute(8)}
                                disabled={isTogglingMute}
                                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                                8 horas
                            </button>
                            <button
                                onClick={() => handleMute(null)}
                                disabled={isTogglingMute}
                                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Para siempre
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
