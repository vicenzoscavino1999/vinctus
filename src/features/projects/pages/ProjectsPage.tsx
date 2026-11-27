import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { CollaborationRead } from '@/features/collaborations/api';
import type { FirestoreEvent } from '@/features/events/api';
import CreateCollaborationModal from '@/features/collaborations/components/CreateCollaborationModal';
import CollaborationDetailModal from '@/features/collaborations/components/CollaborationDetailModal';
import CreateEventModal from '@/features/events/components/CreateEventModal';
import EventDetailModal from '@/features/events/components/EventDetailModal';
import Section, {
  SectionEmpty,
  SectionError,
} from '@/features/discover/components/DiscoverSection';
import Rail, { RailItem } from '@/features/discover/components/Rail';
import CollaborationCard from '@/features/projects/components/CollaborationCard';
import EventCard from '@/features/projects/components/EventCard';
import { useConnections } from '@/features/projects/hooks/useConnections';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';

/**
 * Conexiones: open projects looking for people, then upcoming encounters. The data lives in
 * useConnections; this page lays it out and opens the create and detail modals.
 */
const ProjectsPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const connections = useConnections(user?.uid ?? null);
  const { collaborations, events } = connections;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCollaboration, setEditingCollaboration] = useState<CollaborationRead | null>(null);
  const [selectedCollaboration, setSelectedCollaboration] = useState<CollaborationRead | null>(
    null,
  );
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FirestoreEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FirestoreEvent | null>(null);

  const publishProject = () => {
    if (!user) {
      showToast('Inicia sesión para publicar proyectos', 'info');
      return;
    }
    setEditingCollaboration(null);
    setIsCreateOpen(true);
  };

  const publishEvent = () => {
    if (!user) {
      showToast('Inicia sesión para publicar encuentros', 'info');
      return;
    }
    setEditingEvent(null);
    setIsCreateEventOpen(true);
  };

  const closeCollaborationComposer = (saved: boolean) => {
    setIsCreateOpen(false);
    setEditingCollaboration(null);
    if (saved) collaborations.reload();
  };

  const closeEventComposer = (saved: boolean) => {
    setIsCreateEventOpen(false);
    setEditingEvent(null);
    if (saved) events.reload();
  };

  return (
    <div className="page-projects pb-32">
      <header className="mb-10 pt-6 md:pt-10">
        <h1 className="mb-2 font-display text-display-sm font-normal tracking-tight text-white md:text-display-md">
          Conexiones
        </h1>
        <p className="text-body-sm font-light text-neutral-500">Conecta. Colabora. Encuentra.</p>
      </header>

      <div className="space-y-12">
        <Section
          title="Colaboraciones"
          subtitle="Proyectos abiertos que buscan a alguien"
          action={<PublishButton label="Publicar proyecto" onClick={publishProject} />}
        >
          {collaborations.status === 'loading' ? (
            <Placeholder label="Cargando colaboraciones">
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1].map((index) => (
                  <div key={index} className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" />
                ))}
              </div>
            </Placeholder>
          ) : collaborations.status === 'error' ? (
            <SectionError
              message="No se pudieron cargar las colaboraciones."
              onRetry={collaborations.reload}
            />
          ) : collaborations.items.length === 0 ? (
            <SectionEmpty>Aún no hay proyectos abiertos. Publica el primero.</SectionEmpty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {collaborations.items.map((item) => (
                <CollaborationCard
                  key={item.id}
                  item={item}
                  relation={connections.relationOf(item)}
                  onOpen={() => setSelectedCollaboration(item)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Encuentros"
          subtitle="Próximas reuniones de la comunidad"
          action={<PublishButton label="Publicar encuentro" onClick={publishEvent} />}
        >
          {events.status === 'loading' ? (
            <Placeholder label="Cargando encuentros">
              <div className="flex gap-3 overflow-hidden md:gap-4">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-52 w-[15rem] shrink-0 animate-pulse rounded-2xl bg-white/[0.03] md:w-[16rem]"
                  />
                ))}
              </div>
            </Placeholder>
          ) : events.status === 'error' ? (
            <SectionError message="No se pudieron cargar los encuentros." onRetry={events.reload} />
          ) : events.items.length === 0 ? (
            <SectionEmpty>No hay encuentros próximos. Organiza uno.</SectionEmpty>
          ) : (
            <Rail label="Próximos encuentros">
              {events.items.map((event) => (
                <RailItem key={event.id}>
                  <EventCard
                    event={event}
                    attendees={connections.attendeeCount(event)}
                    onOpen={() => setSelectedEvent(event)}
                  />
                </RailItem>
              ))}
            </Rail>
          )}
        </Section>
      </div>

      <CreateCollaborationModal
        isOpen={isCreateOpen}
        editingCollaboration={editingCollaboration}
        onClose={() => closeCollaborationComposer(false)}
        onCreated={() => closeCollaborationComposer(true)}
        onUpdated={() => closeCollaborationComposer(true)}
      />
      <CreateEventModal
        isOpen={isCreateEventOpen}
        editingEvent={editingEvent}
        onClose={() => closeEventComposer(false)}
        onCreated={() => closeEventComposer(true)}
        onUpdated={() => closeEventComposer(true)}
      />
      <CollaborationDetailModal
        isOpen={!!selectedCollaboration}
        collaboration={selectedCollaboration}
        isRequested={
          selectedCollaboration ? connections.isRequested(selectedCollaboration.id) : false
        }
        onClose={() => setSelectedCollaboration(null)}
        onRequestSent={(collaborationId) => {
          connections.markRequested(collaborationId);
          setSelectedCollaboration(null);
        }}
        onDeleted={() => {
          setSelectedCollaboration(null);
          collaborations.reload();
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
        attendeeCount={selectedEvent ? connections.attendeeCount(selectedEvent) : 0}
        onClose={() => setSelectedEvent(null)}
        onAttendanceChange={connections.setAttendeeCount}
        onEdit={(event) => {
          setSelectedEvent(null);
          setEditingEvent(event);
          setIsCreateEventOpen(true);
        }}
        onDeleted={() => {
          setSelectedEvent(null);
          events.reload();
        }}
      />
    </div>
  );
};

/** The gold "+ Publicar …" of a section, small like the profile's "Publicar". */
function PublishButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-button bg-brand-gold px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-black transition-opacity hover:opacity-90"
    >
      <Plus size={14} />
      {label}
    </button>
  );
}

/** Skeleton blocks with a name for screen readers. */
function Placeholder({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export default ProjectsPage;
