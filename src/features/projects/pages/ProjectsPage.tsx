import { useEffect, useState } from 'react';
import { MapPin, User, ArrowRight, Plus } from 'lucide-react';
import { getCollaborations, type CollaborationRead } from '@/features/collaborations/api';
import {
  getEventAttendeeCount,
  getUpcomingEvents,
  type FirestoreEvent,
} from '@/features/events/api';
import { useToast } from '@/shared/ui/Toast';
import { useAuth } from '@/context/auth';
import CreateCollaborationModal from '@/features/collaborations/components/CreateCollaborationModal';
import CollaborationDetailModal from '@/features/collaborations/components/CollaborationDetailModal';
import CreateEventModal from '@/features/events/components/CreateEventModal';
import EventDetailModal from '@/features/events/components/EventDetailModal';

const formatRelativeTime = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Ahora';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Hace ${months} mes${months === 1 ? '' : 'es'}`;
  const years = Math.floor(months / 12);
  return `Hace ${years} a`;
};

const buildCollaborationTags = (item: CollaborationRead): string[] => {
  const trimmed = (item.tags || [])
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (trimmed.length > 0) return trimmed.slice(0, 3);

  const tags: string[] = [];
  if (item.location) tags.push(item.location);
  tags.push(item.mode === 'virtual' ? 'Virtual' : 'Presencial');
  const levelLabel =
    item.level === 'experto'
      ? 'Nivel Experto'
      : item.level === 'intermedio'
        ? 'Nivel Intermedio'
        : 'Nivel Principiante';
  tags.push(levelLabel);
  return tags.slice(0, 3);
};

const formatEventDate = (value: Date | null): { day: string; month: string } => {
  if (!value) return { day: '--', month: '--' };
  const day = value.toLocaleString('es-ES', { day: '2-digit' });
  const month = value.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  return { day, month };
};

const formatEventLocation = (event: FirestoreEvent): string => {
  const parts = [event.city, event.venue].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(', ') : 'Ubicacion por confirmar';
};

const ProjectsPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [collaborations, setCollaborations] = useState<CollaborationRead[]>([]);
  const [collaborationsLoading, setCollaborationsLoading] = useState(true);
  const [collaborationsError, setCollaborationsError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [editingCollaboration, setEditingCollaboration] = useState<CollaborationRead | null>(null);
  const [editingEvent, setEditingEvent] = useState<FirestoreEvent | null>(null);
  const [selectedCollaboration, setSelectedCollaboration] = useState<CollaborationRead | null>(
    null,
  );
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<FirestoreEvent | null>(null);

  const [events, setEvents] = useState<FirestoreEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventAttendeeCounts, setEventAttendeeCounts] = useState<Record<string, number>>({});

  const loadCollaborations = async () => {
    try {
      setCollaborationsError(null);
      setCollaborationsLoading(true);
      const data = await getCollaborations();
      setCollaborations(data);
    } catch (error) {
      console.error('Error loading collaborations:', error);
      setCollaborationsError('No se pudieron cargar colaboraciones.');
    } finally {
      setCollaborationsLoading(false);
    }
  };

  const handlePublishProject = () => {
    if (!user) {
      showToast('Inicia sesion para publicar proyectos', 'info');
      return;
    }
    setEditingCollaboration(null);
    setIsCreateOpen(true);
  };

  const handleRequestSent = (collaborationId: string) => {
    setRequestedIds((prev) => (prev.includes(collaborationId) ? prev : [...prev, collaborationId]));
  };

  const handlePublishEvent = () => {
    if (!user) {
      showToast('Inicia sesion para publicar encuentros', 'info');
      return;
    }
    setEditingEvent(null);
    setIsCreateEventOpen(true);
  };

  const loadEvents = async () => {
    try {
      setEventsError(null);
      setEventsLoading(true);
      setEventAttendeeCounts({});
      const data = await getUpcomingEvents(12);
      setEvents(data);
    } catch (error) {
      console.error('Error loading events:', error);
      setEventsError('No se pudieron cargar encuentros.');
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    loadCollaborations();
  }, []);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const pending = events.filter((event) => eventAttendeeCounts[event.id] === undefined);
    if (pending.length === 0) return;

    let isActive = true;
    const loadCounts = async () => {
      try {
        const updates: Record<string, number> = {};
        await Promise.all(
          pending.map(async (event) => {
            updates[event.id] = await getEventAttendeeCount(event.id);
          }),
        );
        if (isActive) {
          setEventAttendeeCounts((prev) => ({ ...prev, ...updates }));
        }
      } catch (error) {
        console.error('Error loading event counts:', error);
      }
    };

    loadCounts();

    return () => {
      isActive = false;
    };
  }, [events, eventAttendeeCounts]);

  return (
    <div className="page-projects pb-32">
      {/* Header */}
      <header className="mb-10 pt-6 md:pt-10 flex flex-col md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-display-sm md:text-display-md font-display font-normal text-white mb-3 tracking-tight">
            Conexiones
          </h1>
          <p className="text-neutral-500 font-light text-body-sm">Conecta. Colabora. Encuentra.</p>
        </div>
        <button
          onClick={handlePublishProject}
          className="mt-6 md:mt-0 text-xs bg-brand-gold text-black px-6 py-3 rounded-button btn-premium uppercase tracking-widest font-medium flex items-center gap-2"
        >
          <Plus size={14} />
          PUBLICAR PROYECTO
        </button>
      </header>

      {/* Colaboraciones */}
      <section className="mb-10">
        <h2 className="text-heading-lg font-display font-normal text-white mb-6">Colaboraciones</h2>

        {collaborationsLoading ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            Cargando colaboraciones...
          </div>
        ) : collaborationsError ? (
          <div className="text-sm text-red-400 text-center py-8">{collaborationsError}</div>
        ) : collaborations.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No hay colaboraciones todavia.
          </div>
        ) : (
          collaborations.map((item) => {
            const tags = buildCollaborationTags(item);
            const displayTime = formatRelativeTime(item.createdAt);
            const isOwn = user?.uid === item.authorId;
            const isRequested = requestedIds.includes(item.id);
            const requestLabel = isOwn
              ? 'Tu proyecto'
              : isRequested
                ? 'Solicitud enviada'
                : 'Solicitar';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedCollaboration(item)}
                className="bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-6 mb-4 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-1 rounded">
                    {item.context}
                  </span>
                  <span className="text-neutral-600 text-xs">{displayTime}</span>
                </div>

                <h3 className="text-xl md:text-2xl text-white font-serif font-light mb-2 group-hover:text-white/90">
                  {item.title}
                </h3>

                <p className="text-neutral-500 text-sm mb-4">
                  Por <span className="text-amber-200/80">{item.authorSnapshot.displayName}</span>
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCollaboration(item);
                      }}
                      disabled={isOwn || isRequested}
                      className="text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {requestLabel}
                    </button>
                    <ArrowRight
                      size={16}
                      className="text-neutral-600 group-hover:text-white transition-colors"
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Encuentros */}
      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className="text-2xl font-serif font-light text-white">Encuentros</h2>
          <button
            onClick={handlePublishEvent}
            className="text-[11px] bg-brand-gold text-black px-5 py-2 rounded-button btn-premium uppercase tracking-widest font-medium flex items-center gap-2"
          >
            <Plus size={12} />
            Publicar encuentro
          </button>
        </div>

        {eventsLoading ? (
          <div className="text-sm text-neutral-500 text-center py-8">Cargando encuentros...</div>
        ) : eventsError ? (
          <div className="text-sm text-red-400 text-center py-8">{eventsError}</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-8">
            No hay encuentros todavia.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
            {events.map((event) => {
              const dateParts = formatEventDate(event.startAt);
              const locationLabel = formatEventLocation(event);
              const attendees = eventAttendeeCounts[event.id] ?? 0;
              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="flex-shrink-0 w-[220px] bg-neutral-900/30 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <span className="text-3xl font-serif text-white font-light">
                        {dateParts.day}
                      </span>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mt-1">
                        {dateParts.month}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center group-hover:bg-white group-hover:border-white transition-all">
                      <ArrowRight
                        size={14}
                        className="text-neutral-500 group-hover:text-black transition-colors"
                      />
                    </div>
                  </div>

                  <h4 className="text-white font-light text-sm mb-3 line-clamp-2 group-hover:text-white/90">
                    {event.title}
                  </h4>

                  <div className="flex items-center gap-1 text-neutral-500 text-xs mb-1">
                    <MapPin size={10} />
                    <span>{locationLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 text-neutral-500 text-xs">
                    <User size={10} />
                    <span>{attendees}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CreateCollaborationModal
        isOpen={isCreateOpen}
        editingCollaboration={editingCollaboration}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingCollaboration(null);
        }}
        onCreated={() => {
          setIsCreateOpen(false);
          setEditingCollaboration(null);
          loadCollaborations();
        }}
        onUpdated={() => {
          setIsCreateOpen(false);
          setEditingCollaboration(null);
          loadCollaborations();
        }}
      />
      <CreateEventModal
        isOpen={isCreateEventOpen}
        editingEvent={editingEvent}
        onClose={() => {
          setIsCreateEventOpen(false);
          setEditingEvent(null);
        }}
        onCreated={() => {
          setIsCreateEventOpen(false);
          setEditingEvent(null);
          loadEvents();
        }}
        onUpdated={() => {
          setIsCreateEventOpen(false);
          setEditingEvent(null);
          loadEvents();
        }}
      />
      <CollaborationDetailModal
        isOpen={!!selectedCollaboration}
        collaboration={selectedCollaboration}
        isRequested={
          selectedCollaboration ? requestedIds.includes(selectedCollaboration.id) : false
        }
        onClose={() => setSelectedCollaboration(null)}
        onRequestSent={(collaborationId) => {
          handleRequestSent(collaborationId);
          setSelectedCollaboration(null);
        }}
        onDeleted={() => {
          setSelectedCollaboration(null);
          loadCollaborations();
        }}
        onEdit={(collaboration) => {
          setSelectedCollaboration(null);
          setEditingCollaboration(collaboration);
          setIsCreateOpen(true);
        }}
      />
      <EventDetailModal
        isOpen={!!selectedEvent}
        event={selectedEvent}
        attendeeCount={selectedEvent ? (eventAttendeeCounts[selectedEvent.id] ?? 0) : 0}
        onClose={() => setSelectedEvent(null)}
        onAttendanceChange={(eventId, count) => {
          setEventAttendeeCounts((prev) => ({ ...prev, [eventId]: count }));
        }}
        onEdit={(event) => {
          setSelectedEvent(null);
          setEditingEvent(event);
          setIsCreateEventOpen(true);
        }}
        onDeleted={() => {
          setSelectedEvent(null);
          loadEvents();
        }}
      />
    </div>
  );
};

export default ProjectsPage;
