import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    acceptCollaborationRequest,
    getOrCreateDirectConversation,
    getPendingCollaborationRequests,
    rejectCollaborationRequest,
    type CollaborationRequestRead
} from '../lib/firestore';
import { useToast } from '../components/Toast';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [requests, setRequests] = useState<CollaborationRequestRead[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadRequests = async () => {
        if (!user) return;
        try {
            setError(null);
            setLoading(true);
            const data = await getPendingCollaborationRequests(user.uid);
            setRequests(data);
        } catch (loadError) {
            console.error('Error loading collaboration requests:', loadError);
            setError('No se pudieron cargar las solicitudes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        loadRequests();
    }, [user?.uid]);

    const handleAccept = async (request: CollaborationRequestRead) => {
        if (!user) return;
        try {
            await acceptCollaborationRequest(request.id);
            await getOrCreateDirectConversation(user.uid, request.fromUid);
            setRequests((prev) => prev.filter((item) => item.id !== request.id));
            showToast('Solicitud aceptada. Conversacion habilitada.', 'success');
        } catch (acceptError) {
            console.error('Error accepting request:', acceptError);
            showToast('No se pudo aceptar la solicitud.', 'error');
        }
    };

    const handleReject = async (requestId: string) => {
        try {
            await rejectCollaborationRequest(requestId);
            setRequests((prev) => prev.filter((item) => item.id !== requestId));
            showToast('Solicitud rechazada.', 'info');
        } catch (rejectError) {
            console.error('Error rejecting request:', rejectError);
            showToast('No se pudo rechazar la solicitud.', 'error');
        }
    };

    return (
        <div className="page-profile pt-10 max-w-2xl mx-auto">
            <h1 className="text-3xl font-serif font-light text-white mb-8">Notificaciones</h1>
            {!user ? (
                <div className="text-neutral-500 text-sm text-center py-10">
                    Inicia sesion para ver tus notificaciones.
                </div>
            ) : (
                <div className="space-y-8">
                    <div>
                        <h2 className="text-lg font-serif text-white mb-4">Solicitudes de colaboracion</h2>
                        {loading ? (
                            <div className="text-sm text-neutral-500 py-6 text-center">Cargando solicitudes...</div>
                        ) : error ? (
                            <div className="text-sm text-red-400 py-6 text-center">{error}</div>
                        ) : requests.length === 0 ? (
                            <div className="text-sm text-neutral-500 py-6 text-center">
                                No tienes solicitudes pendientes.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {requests.map((request) => (
                                    <div
                                        key={request.id}
                                        className="p-4 border border-neutral-800 rounded-lg bg-neutral-900/30"
                                    >
                                        <p className="text-neutral-300 text-sm mb-2">
                                            <span className="text-white">{request.fromUserName || 'Usuario'}</span> quiere
                                            colaborar en <span className="text-amber-200/80">{request.collaborationTitle}</span>.
                                        </p>
                                        {request.message && (
                                            <p className="text-neutral-500 text-sm mb-4">{request.message}</p>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleAccept(request)}
                                                className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors"
                                            >
                                                Aceptar
                                            </button>
                                            <button
                                                onClick={() => handleReject(request.id)}
                                                className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                                            >
                                                Rechazar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                            <p className="text-neutral-400">
                                <button
                                    onClick={() => navigate('/user/dr-elena-r')}
                                    className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                                >Dr. Elena R.</button> comento en tu publicacion
                            </p>
                            <span className="text-neutral-600 text-xs">Hace 2 horas</span>
                        </div>
                        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                            <p className="text-neutral-400">
                                <button
                                    onClick={() => navigate('/user/marco-v')}
                                    className="text-white cursor-pointer hover:underline bg-transparent border-none p-0 font-inherit"
                                >Marco V.</button> te menciono en un debate
                            </p>
                            <span className="text-neutral-600 text-xs">Hace 5 horas</span>
                        </div>
                        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
                            <p className="text-neutral-400">Tu ensayo recibio <span className="text-white">15 nuevas reacciones</span></p>
                            <span className="text-neutral-600 text-xs">Ayer</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsPage;
