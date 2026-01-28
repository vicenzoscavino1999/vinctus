import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User as UserIcon, Users, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUserProfile, type UserProfileRead } from '../lib/firestore';
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

export default function ConversationDetailsPage() {
    const navigate = useNavigate();
    const { conversationId } = useParams<{ conversationId: string }>();
    const { user } = useAuth();

    const [otherUserProfile, setOtherUserProfile] = useState<UserProfileRead | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

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

    const handleGoBack = () => {
        navigate('/messages');
    };

    const handleViewProfile = () => {
        if (!otherUserProfile) return;
        // Use /user/:userId route (confirmed in AppLayout line 206)
        navigate(`/user/${otherUserProfile.uid}`);
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

                {/* Mute - Coming Soon (Fase 3) */}
                <div className="w-full flex items-center gap-4 p-4 bg-neutral-900/10 border border-neutral-800/30 rounded-xl opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-neutral-600 text-lg">🔕</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-neutral-400 font-medium">Silenciar</p>
                        <p className="text-xs text-neutral-600">Próximamente</p>
                    </div>
                </div>

                {/* Block - Coming Soon (Fase 3) */}
                <div className="w-full flex items-center gap-4 p-4 bg-neutral-900/10 border border-neutral-800/30 rounded-xl opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-neutral-600 text-lg">🚫</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-neutral-400 font-medium">Bloquear</p>
                        <p className="text-xs text-neutral-600">Próximamente</p>
                    </div>
                </div>

                {/* Report - Coming Soon (Fase 3) */}
                <div className="w-full flex items-center gap-4 p-4 bg-neutral-900/10 border border-neutral-800/30 rounded-xl opacity-50 cursor-not-allowed">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={18} className="text-neutral-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-neutral-400 font-medium">Reportar</p>
                        <p className="text-xs text-neutral-600">Próximamente</p>
                    </div>
                </div>
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
        </div>
    );
}
