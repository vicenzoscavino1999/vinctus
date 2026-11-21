import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsPage from '@/features/projects/pages/ProjectsPage';
import type { CollaborationRead } from '@/features/collaborations/api';
import type { FirestoreEvent } from '@/features/events/api';

const authMock = vi.hoisted(() => ({
  user: { uid: 'viewer-1', displayName: 'Viewer', photoURL: null } as {
    uid: string;
    displayName: string;
    photoURL: string | null;
  } | null,
}));
const toastMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}));
const collabApiMock = vi.hoisted(() => ({
  getCollaborations: vi.fn(),
  createCollaboration: vi.fn(),
  updateCollaboration: vi.fn(),
  deleteCollaboration: vi.fn(),
  sendCollaborationRequest: vi.fn(),
}));
const eventsApiMock = vi.hoisted(() => ({
  getUpcomingEvents: vi.fn(),
  getEventAttendeeCount: vi.fn(),
  isEventAttendee: vi.fn(),
  joinEvent: vi.fn(),
  leaveEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
const groupsApiMock = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
}));

vi.mock('@/context/auth', () => ({
  useAuth: () => authMock,
}));
vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => toastMock,
}));
vi.mock('@/features/collaborations/api', () => collabApiMock);
vi.mock('@/features/events/api', () => eventsApiMock);
vi.mock('@/features/groups/api', () => groupsApiMock);

const makeCollab = (overrides: Partial<CollaborationRead>): CollaborationRead => ({
  id: 'c-1',
  title: 'Telescopio DIY',
  context: 'Astronomía amateur',
  seekingRole: 'Óptica',
  mode: 'virtual',
  location: null,
  level: 'intermedio',
  topic: null,
  tags: ['astronomía'],
  authorId: 'author-good',
  authorSnapshot: { displayName: 'Sofía', photoURL: null },
  status: 'open',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

const makeEvent = (overrides: Partial<FirestoreEvent>): FirestoreEvent => ({
  id: 'e-1',
  title: 'Noche de estrellas',
  description: 'Observación abierta',
  startAt: new Date('2026-07-01T20:00:00Z'),
  endAt: null,
  city: 'Lima',
  venue: 'Observatorio',
  capacity: 2,
  attendeesCount: 2,
  visibility: 'public',
  createdBy: 'author-good',
  coverUrl: null,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: 'viewer-1', displayName: 'Viewer', photoURL: null };
    groupsApiMock.getBlockedUsers.mockResolvedValue(['author-blocked']);
    collabApiMock.getCollaborations.mockResolvedValue([
      makeCollab({ id: 'c-good', title: 'Telescopio DIY', authorId: 'author-good' }),
      makeCollab({ id: 'c-bad', title: 'Proyecto Oculto', authorId: 'author-blocked' }),
    ]);
    eventsApiMock.getUpcomingEvents.mockResolvedValue([
      makeEvent({ id: 'e-good', title: 'Noche de estrellas', createdBy: 'author-good' }),
      makeEvent({ id: 'e-bad', title: 'Evento Oculto', createdBy: 'author-blocked' }),
    ]);
    eventsApiMock.getEventAttendeeCount.mockResolvedValue(2);
    eventsApiMock.isEventAttendee.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters collaborations and events from blocked users', async () => {
    render(<ProjectsPage />);

    expect(await screen.findByText('Telescopio DIY')).toBeInTheDocument();
    expect(screen.queryByText('Proyecto Oculto')).not.toBeInTheDocument();
    expect(await screen.findByText('Noche de estrellas')).toBeInTheDocument();
    expect(screen.queryByText('Evento Oculto')).not.toBeInTheDocument();
  });

  it('skips authenticated attendee count queries when signed out', async () => {
    authMock.user = null;
    render(<ProjectsPage />);

    expect(await screen.findByText('Noche de estrellas')).toBeInTheDocument();
    expect(eventsApiMock.getEventAttendeeCount).not.toHaveBeenCalled();
  });

  it('disables joining when event capacity is full and uses inline delete confirmation for owner', async () => {
    const confirmMock = vi.fn();
    vi.stubGlobal('confirm', confirmMock);
    eventsApiMock.getUpcomingEvents.mockResolvedValueOnce([
      makeEvent({
        id: 'e-full',
        title: 'Encuentro lleno',
        capacity: 2,
        createdBy: 'viewer-1',
      }),
    ]);
    eventsApiMock.deleteEvent.mockResolvedValueOnce(undefined);

    render(<ProjectsPage />);

    fireEvent.click(await screen.findByText('Encuentro lleno'));

    const fullButton = await screen.findByRole('button', { name: 'Aforo completo' });
    expect(fullButton).toBeDisabled();

    // Owner deletes using inline confirmation, never window.confirm
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(confirmMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar eliminar' }));

    await waitFor(() => {
      expect(eventsApiMock.deleteEvent).toHaveBeenCalledWith('e-full');
    });
  });

  it('shows retry buttons when collaborations or events fail to load', async () => {
    collabApiMock.getCollaborations
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce([makeCollab({ id: 'c-ok', title: 'Recuperado' })]);

    render(<ProjectsPage />);

    expect(
      await screen.findByText('No se pudieron cargar las colaboraciones.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Recuperado')).toBeInTheDocument();
  });
});
