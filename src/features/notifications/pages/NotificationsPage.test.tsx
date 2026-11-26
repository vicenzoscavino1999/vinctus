import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from '@/features/notifications/pages/NotificationsPage';
import type { CollaborationRequestRead } from '@/features/collaborations/api';
import type { GroupJoinRequestRead } from '@/features/groups/api';
import type { ActivityRead } from '@/features/notifications/api';

const authMock = vi.hoisted(() => ({
  user: { uid: 'viewer-1', displayName: 'Viewer' } as { uid: string; displayName: string } | null,
}));
const toastMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}));
const collabApiMock = vi.hoisted(() => ({
  getPendingCollaborationRequests: vi.fn(),
  acceptCollaborationRequest: vi.fn(),
  rejectCollaborationRequest: vi.fn(),
}));
const groupsApiMock = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
  getPendingGroupJoinRequests: vi.fn(),
  acceptGroupJoinRequest: vi.fn(),
  rejectGroupJoinRequest: vi.fn(),
}));
const profileApiMock = vi.hoisted(() => ({
  getIncomingFollowRequests: vi.fn(),
  acceptFollowRequest: vi.fn(),
  declineFollowRequest: vi.fn(),
  getOrCreateDirectConversation: vi.fn(),
}));
const notificationsApiMock = vi.hoisted(() => ({
  getUserActivity: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
  notifyNotificationsUpdated: vi.fn(),
}));

vi.mock('@/context/auth', () => ({
  useAuth: () => authMock,
}));
vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => toastMock,
}));
vi.mock('@/features/collaborations/api', () => collabApiMock);
vi.mock('@/features/groups/api', () => groupsApiMock);
vi.mock('@/features/profile/api', () => profileApiMock);
vi.mock('@/features/notifications/api', () => notificationsApiMock);

const makeCollabRequest = (
  overrides: Partial<CollaborationRequestRead>,
): CollaborationRequestRead => ({
  id: 'cr-1',
  collaborationId: 'collab-1',
  collaborationTitle: 'Proyecto Astronomía',
  fromUid: 'user-good',
  toUid: 'viewer-1',
  status: 'pending',
  message: 'Me gustaría participar',
  fromUserName: 'Clara',
  fromUserPhoto: null,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

const makeGroupRequest = (overrides: Partial<GroupJoinRequestRead>): GroupJoinRequestRead => ({
  id: 'gr-1',
  groupId: 'grp-1',
  groupName: 'Club Física',
  fromUid: 'user-good',
  toUid: 'viewer-1',
  status: 'pending',
  message: null,
  fromUserName: 'Clara',
  fromUserPhoto: null,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

const makeActivity = (overrides: Partial<ActivityRead>): ActivityRead => ({
  id: 'act-1',
  type: 'post_like',
  toUid: 'viewer-1',
  fromUid: 'user-good',
  fromUserName: 'Clara',
  fromUserPhoto: null,
  postId: 'post-1',
  postSnippet: 'Observación lunar',
  commentText: null,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  read: false,
  ...overrides,
});

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: 'viewer-1', displayName: 'Viewer' };
    groupsApiMock.getBlockedUsers.mockResolvedValue(['user-blocked']);
    collabApiMock.getPendingCollaborationRequests.mockResolvedValue([
      makeCollabRequest({ id: 'cr-good', fromUid: 'user-good', fromUserName: 'Clara' }),
      makeCollabRequest({ id: 'cr-bad', fromUid: 'user-blocked', fromUserName: 'Bloqueado' }),
    ]);
    groupsApiMock.getPendingGroupJoinRequests.mockResolvedValue([
      makeGroupRequest({ id: 'gr-good', fromUid: 'user-good', fromUserName: 'Clara' }),
      makeGroupRequest({ id: 'gr-bad', fromUid: 'user-blocked', fromUserName: 'Bloqueado' }),
    ]);
    profileApiMock.getIncomingFollowRequests.mockResolvedValue({
      items: [
        {
          id: 'fr-good',
          fromUid: 'user-good',
          toUid: 'viewer-1',
          status: 'pending',
          createdAt: new Date('2026-06-01T10:00:00Z'),
          updatedAt: new Date('2026-06-01T10:00:00Z'),
          fromUser: { uid: 'user-good', displayName: 'Clara', username: 'clara', photoURL: null },
        },
        {
          id: 'fr-bad',
          fromUid: 'user-blocked',
          toUid: 'viewer-1',
          status: 'pending',
          createdAt: new Date('2026-06-01T10:00:00Z'),
          updatedAt: new Date('2026-06-01T10:00:00Z'),
          fromUser: {
            uid: 'user-blocked',
            displayName: 'Bloqueado',
            username: 'blocked',
            photoURL: null,
          },
        },
      ],
      lastDoc: null,
      hasMore: false,
    });
    notificationsApiMock.getUserActivity.mockResolvedValue({
      items: [
        makeActivity({ id: 'act-good', fromUid: 'user-good', fromUserName: 'Clara' }),
        makeActivity({ id: 'act-bad', fromUid: 'user-blocked', fromUserName: 'Bloqueado' }),
      ],
      lastDoc: null,
      hasMore: false,
    });
    notificationsApiMock.markNotificationRead.mockResolvedValue(undefined);
    notificationsApiMock.markAllNotificationsRead.mockResolvedValue(undefined);
    notificationsApiMock.deleteNotification.mockResolvedValue(undefined);
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/user/:userId" element={<div>Perfil destino</div>} />
          <Route path="/post/:postId" element={<div>Publicación destino</div>} />
        </Routes>
      </MemoryRouter>,
    );
  const row = (sentence: string) => screen.findByRole('article', { name: sentence });
  const openRequests = () => fireEvent.click(screen.getByRole('tab', { name: /Solicitudes/ }));
  const LIKE_CLARA = 'Clara le dio “Me gusta” a tu publicación';

  it('opens on activity, summarizes pending requests and hides blocked senders everywhere', async () => {
    renderPage();

    expect(await row(LIKE_CLARA)).toBeInTheDocument();
    expect(screen.queryByText(/Bloqueado/)).not.toBeInTheDocument();
    expect(await screen.findByText('Solicitudes pendientes')).toBeInTheDocument();
    expect(screen.getByText('Clara y 2 más esperan tu respuesta')).toBeInTheDocument();
    // The blocked list is asked once for both activity and requests.
    expect(groupsApiMock.getBlockedUsers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Solicitudes pendientes'));
    expect(await screen.findAllByRole('article', { name: 'Solicitud de Clara' })).toHaveLength(3);
    expect(screen.getByText('@clara')).toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Grupos/ }));
    const [groupRequest] = screen.getAllByRole('article', { name: 'Solicitud de Clara' });
    expect(screen.getAllByRole('article', { name: 'Solicitud de Clara' })).toHaveLength(1);
    expect(within(groupRequest).getByText(/Club Física/)).toBeInTheDocument();
  });

  it('removes accepted collaboration request even if direct conversation creation is denied', async () => {
    collabApiMock.acceptCollaborationRequest.mockResolvedValueOnce(undefined);
    profileApiMock.getOrCreateDirectConversation.mockRejectedValueOnce(
      new Error('permission-denied'),
    );

    renderPage();
    openRequests();
    fireEvent.click(await screen.findByRole('button', { name: /^Colaboración/ }));
    const request = await screen.findByRole('article', { name: 'Solicitud de Clara' });
    fireEvent.click(within(request).getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      expect(screen.queryByRole('article', { name: 'Solicitud de Clara' })).not.toBeInTheDocument();
    });
    expect(collabApiMock.acceptCollaborationRequest).toHaveBeenCalledWith('cr-good');
    expect(notificationsApiMock.notifyNotificationsUpdated).toHaveBeenCalledTimes(1);
    expect(toastMock.showToast).toHaveBeenCalledWith(
      expect.stringContaining('Solicitud aceptada'),
      'success',
    );
  });

  it('keeps the other requests when one source fails, and retries only that one', async () => {
    collabApiMock.getPendingCollaborationRequests
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([
        makeCollabRequest({ id: 'cr-recovered', fromUid: 'user-good', fromUserName: 'Clara' }),
      ]);

    renderPage();
    openRequests();

    expect(
      await screen.findByText('No se pudieron cargar algunas solicitudes.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Solicitud de Clara' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(screen.getAllByRole('article', { name: 'Solicitud de Clara' })).toHaveLength(3);
    });
    expect(
      screen.queryByText('No se pudieron cargar algunas solicitudes.'),
    ).not.toBeInTheDocument();
    expect(profileApiMock.getIncomingFollowRequests).toHaveBeenCalledTimes(1);
  });

  it('supports marking single/all activity items as read, deleting with rollback, and type filters', async () => {
    notificationsApiMock.getUserActivity.mockResolvedValueOnce({
      items: [
        makeActivity({ id: 'act-like', type: 'post_like', fromUserName: 'Clara', read: false }),
        makeActivity({
          id: 'act-comment',
          type: 'post_comment',
          fromUserName: 'Diego',
          commentText: 'Gran observación',
          read: false,
        }),
        makeActivity({
          id: 'act-follow',
          type: 'follow',
          fromUserName: 'Elena',
          postId: null,
          read: true,
        }),
      ],
      lastDoc: null,
      hasMore: false,
    });

    renderPage();

    expect(await row(LIKE_CLARA)).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Diego comentó en tu publicación' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Elena empezó a seguirte' })).toBeInTheDocument();
    expect(screen.getByText('“Gran observación”')).toBeInTheDocument();

    // Filter to Comentarios
    fireEvent.click(screen.getByRole('button', { name: 'Comentarios' }));
    expect(
      screen.getByRole('article', { name: 'Diego comentó en tu publicación' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: LIKE_CLARA })).not.toBeInTheDocument();

    // Back to Todas and mark single item read
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    const markReadButtons = screen.getAllByRole('button', { name: 'Marcar como leída' });
    expect(markReadButtons).toHaveLength(2);
    fireEvent.click(markReadButtons[0]);

    await waitFor(() => {
      expect(notificationsApiMock.markNotificationRead).toHaveBeenCalledWith('act-like', true);
    });
    expect(screen.getAllByRole('button', { name: 'Marcar como leída' })).toHaveLength(1);

    // Mark remaining unread item via "Marcar todo como leído"
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todo como leído' }));
    await waitFor(() => {
      expect(notificationsApiMock.markAllNotificationsRead).toHaveBeenCalledWith(['act-comment']);
    });
    expect(
      screen.queryByRole('button', { name: 'Marcar todo como leído' }),
    ).not.toBeInTheDocument();

    // Filter to No leídas shows filter-specific empty message
    fireEvent.click(screen.getByRole('button', { name: 'No leídas' }));
    expect(screen.getByText('No hay actividad que coincida con tu filtro.')).toBeInTheDocument();

    // Return to Todas and verify delete rollback on error, then delete success
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    notificationsApiMock.deleteNotification.mockRejectedValueOnce(new Error('network'));
    const likeRow = screen.getByRole('article', { name: LIKE_CLARA });
    fireEvent.click(within(likeRow).getByRole('button', { name: 'Eliminar notificación' }));

    await waitFor(() => {
      expect(toastMock.showToast).toHaveBeenCalledWith(
        'No se pudo eliminar la notificación.',
        'error',
      );
    });
    const restored = await row(LIKE_CLARA);

    notificationsApiMock.deleteNotification.mockResolvedValueOnce(undefined);
    fireEvent.click(within(restored).getByRole('button', { name: 'Eliminar notificación' }));
    await waitFor(() => {
      expect(screen.queryByRole('article', { name: LIKE_CLARA })).not.toBeInTheDocument();
    });
  });

  it('shows repeated follows from one person once, and marking it read marks them all', async () => {
    notificationsApiMock.getUserActivity.mockResolvedValueOnce({
      items: ['f1', 'f2', 'f3'].map((id, index) =>
        makeActivity({
          id,
          type: 'follow',
          fromUid: 'user-good',
          fromUserName: 'Vicenzo_prueba',
          postId: null,
          createdAt: new Date(Date.UTC(2026, 0, 10 - index)),
        }),
      ),
      lastDoc: null,
      hasMore: false,
    });

    renderPage();

    const follow = await row('Vicenzo_prueba empezó a seguirte');
    expect(
      screen.getAllByRole('article', { name: 'Vicenzo_prueba empezó a seguirte' }),
    ).toHaveLength(1);
    fireEvent.click(within(follow).getByRole('button', { name: 'Marcar como leída' }));
    await waitFor(() => {
      expect(notificationsApiMock.markAllNotificationsRead).toHaveBeenCalledWith([
        'f1',
        'f2',
        'f3',
      ]);
    });

    // The row opens the profile.
    fireEvent.click(within(follow).getByRole('button', { name: 'Ver perfil' }));
    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
  });

  it('auto-skips blocked-only activity pages and deduplicates overlapping pagination items', async () => {
    const cursor1 = { id: 'c1' };
    const cursor2 = { id: 'c2' };
    notificationsApiMock.getUserActivity
      .mockResolvedValueOnce({
        items: [
          makeActivity({ id: 'act-blocked-1', fromUid: 'user-blocked', fromUserName: 'Bloqueado' }),
        ],
        lastDoc: cursor1,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [makeActivity({ id: 'act-page-2', fromUid: 'user-good', fromUserName: 'Clara' })],
        lastDoc: cursor2,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          makeActivity({ id: 'act-page-2', fromUid: 'user-good', fromUserName: 'Clara' }),
          makeActivity({
            id: 'act-page-3',
            fromUid: 'user-sofia',
            fromUserName: 'Sofía',
            postId: 'post-2',
          }),
        ],
        lastDoc: null,
        hasMore: false,
      });

    renderPage();

    expect(await row(LIKE_CLARA)).toBeInTheDocument();
    expect(notificationsApiMock.getUserActivity).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await row('Sofía le dio “Me gusta” a tu publicación')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: LIKE_CLARA })).toHaveLength(1);
  });

  it('resets previous account activity cleanly when switching directly from userA to userB', async () => {
    notificationsApiMock.getUserActivity
      .mockResolvedValueOnce({
        items: [makeActivity({ id: 'act-a', fromUserName: 'SoloDeUsuarioA' })],
        lastDoc: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [makeActivity({ id: 'act-b', toUid: 'viewer-2', fromUserName: 'SoloDeUsuarioB' })],
        lastDoc: null,
        hasMore: false,
      });

    const { rerender } = render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await row('SoloDeUsuarioA le dio “Me gusta” a tu publicación')).toBeInTheDocument();

    authMock.user = { uid: 'viewer-2', displayName: 'Viewer 2' };
    rerender(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await row('SoloDeUsuarioB le dio “Me gusta” a tu publicación')).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'SoloDeUsuarioA le dio “Me gusta” a tu publicación' }),
    ).not.toBeInTheDocument();
  });

  it('navigates to requester profile when clicking requester name on request card', async () => {
    renderPage();
    openRequests();

    const [requesterButton] = await screen.findAllByRole('button', { name: 'Clara' });
    fireEvent.click(requesterButton);
    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
  });
});
