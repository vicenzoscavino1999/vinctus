import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  });

  it('filters blocked users across collaboration, follow, group requests, and activity', async () => {
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Clara')).toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();

    // Followers tab
    fireEvent.click(screen.getAllByText('Seguidores')[0]);
    expect(await screen.findByText('@clara')).toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();

    // Groups tab
    fireEvent.click(screen.getAllByText('Grupos')[0]);
    expect(await screen.findByText('Club Física')).toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();

    // Activity tab
    fireEvent.click(screen.getByText('Actividad'));
    expect(await screen.findByText('Clara le dio "Me gusta" a tu publicación')).toBeInTheDocument();
    expect(screen.queryByText(/Bloqueado/)).not.toBeInTheDocument();
  });

  it('removes accepted collaboration request even if direct conversation creation is denied', async () => {
    collabApiMock.acceptCollaborationRequest.mockResolvedValueOnce(undefined);
    profileApiMock.getOrCreateDirectConversation.mockRejectedValueOnce(
      new Error('permission-denied'),
    );

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Clara')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      expect(screen.queryByText('Clara')).not.toBeInTheDocument();
    });
    expect(collabApiMock.acceptCollaborationRequest).toHaveBeenCalledWith('cr-good');
    expect(toastMock.showToast).toHaveBeenCalledWith(
      expect.stringContaining('Solicitud aceptada'),
      'success',
    );
  });

  it('renders a retry button on load error and recovers cleanly', async () => {
    collabApiMock.getPendingCollaborationRequests
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([
        makeCollabRequest({ id: 'cr-recovered', fromUid: 'user-good', fromUserName: 'Clara' }),
      ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No se pudieron cargar las solicitudes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Clara')).toBeInTheDocument();
  });
});
