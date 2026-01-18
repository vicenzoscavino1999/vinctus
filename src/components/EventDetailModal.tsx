import { useEffect, useMemo, useState } from 'react';
import { Calendar, MapPin, Users, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { deleteEvent, isEventAttendee, joinEvent, leaveEvent, type FirestoreEvent } from '../lib/firestore';

interface EventDetailModalProps {
    isOpen: boolean;
    event: FirestoreEvent | null;
    attendeeCount: number;
    onClose: () => void;
    onAttendanceChange?: (eventId: string, count: number) => void;
    onEdit?: (event: FirestoreEvent) => void;
    onDeleted?: () => void;
}

const formatEventDate = (value: Date | null): string => {
    if (!value) return 'Fecha por confirmar';
    return value.toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatLocation = (event: FirestoreEvent): string | null => {
    const parts = [event.city, event.venue].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(', ') : null;
};

const EventDetailModal = ({
    isOpen,
    event,
    attendeeCount,
    onClose,
    onAttendanceChange,
    onEdit,
    onDeleted
}: EventDetailModalProps) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [isAttending, setIsAttending] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [localCount, setLocalCount] = useState(attendeeCount);

    useEffect(() => {
        if (!isOpen || !event) return;
        setLocalCount(attendeeCount);
    }, [isOpen, event?.id, attendeeCount]);

    useEffect(() => {
        if (!isOpen || !event) return;
        if (!user) {
            setIsAttending(false);
            return;
        }

        let isActive = true;
        const loadStatus = async () => {
            try {
                const joined = await isEventAttendee(event.id, user.uid);
                if (isActive) {
                    setIsAttending(joined);
                }
            } catch (error) {
                console.error('Error loading event attendance:', error);
            }
        };

        loadStatus();

        return () => {
            isActive = false;
        };
    }, [isOpen, event?.id, user]);

    const locationLabel = useMemo(() => {
        if (!event) return null;
        return formatLocation(event);
    }, [event]);

    const mapUrl = useMemo(() => {
        if (!locationLabel) return null;
        const query = encodeURIComponent(locationLabel);
        return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }, [locationLabel]);

    const isOwner = !!user && !!event && user.uid === event.createdBy;

    const handleDelete = async () => {
        if (!event) return;
        const confirmed = window.confirm('¿Eliminar este encuentro? Esta accion no se puede deshacer.');
        if (!confirmed) return;
        setIsDeleting(true);
        try {
            await deleteEvent(event.id);
            showToast('Encuentro eliminado', 'success');
            onDeleted?.();
            onClose();
        } catch (error) {
            console.error('Error deleting event:', error);
            showToast('No se pudo eliminar el encuentro.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleAttendance = async () => {
        if (!event) return;
        if (!user) {
            showToast('Inicia sesion para unirte', 'info');
            return;
        }

        setIsLoading(true);
        try {
            if (isAttending) {
                await leaveEvent(event.id, user.uid);
                const nextCount = Math.max(0, localCount - 1);
                setLocalCount(nextCount);
                setIsAttending(false);
                onAttendanceChange?.(event.id, nextCount);
                showToast('Saliste del encuentro', 'info');
            } else {
                await joinEvent(event.id, user.uid);
                const nextCount = localCount + 1;
                setLocalCount(nextCount);
                setIsAttending(true);
                onAttendanceChange?.(event.id, nextCount);
                showToast('Te uniste al encuentro', 'success');
            }
        } catch (error) {
            console.error('Error updating attendance:', error);
            showToast('No se pudo actualizar tu asistencia.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !event) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-3xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <h2 className="text-xl font-serif text-white">Detalle del encuentro</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-2xl text-white font-serif font-light mb-2">{event.title}</h3>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-400">
                            <span className="inline-flex items-center gap-2">
                                <Calendar size={16} className="text-neutral-500" />
                                {formatEventDate(event.startAt)}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <Users size={16} className="text-neutral-500" />
                                {localCount} asistentes
                            </span>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
                            <span className="text-xs uppercase tracking-widest text-neutral-500">Descripcion</span>
                            <p className="text-sm text-neutral-200 leading-relaxed">
                                {event.description || 'Descripcion por confirmar.'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
                            <span className="text-xs uppercase tracking-widest text-neutral-500">Ubicacion</span>
                            <div className="flex items-start gap-2 text-sm text-neutral-200">
                                <MapPin size={16} className="text-neutral-500 mt-0.5" />
                                <span>{locationLabel || 'Ubicacion por confirmar'}</span>
                            </div>
                            {mapUrl && (
                                <a
                                    href={mapUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                                >
                                    Ver mapa
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {event.capacity !== null && (
                            <span className="text-xs uppercase tracking-widest text-neutral-500">
                                Capacidad: {event.capacity}
                            </span>
                        )}
                        <span className="text-xs uppercase tracking-widest text-neutral-500">
                            {event.visibility === 'public' ? 'Publico' : 'Privado'}
                        </span>
                    </div>

                    {isOwner && (
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => onEdit?.(event)}
                                className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                            >
                                Editar
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-red-500/50 text-red-400 hover:text-white hover:border-red-400 transition-colors ${
                                    isDeleting ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                            >
                                Eliminar
                            </button>
                        </div>
                    )}

                    <button
                        onClick={handleToggleAttendance}
                        disabled={isLoading}
                        className={`px-6 py-2.5 rounded-full text-xs uppercase tracking-widest transition-all border ${
                            isAttending
                                ? 'border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300'
                                : 'border-amber-500/60 text-amber-200 hover:text-white hover:border-amber-400'
                        } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        {isAttending ? 'Cancelar asistencia' : 'Unirme'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EventDetailModal;
