import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditProfileModal from '@/features/profile/components/EditProfileModal';
import ContributionsSection from '@/features/profile/components/ContributionsSection';
import UserProfilePage from '@/features/profile/components/UserProfilePage';
import FollowListPage from '@/features/profile/pages/FollowListPage';
import { AppError } from '@/shared/lib/errors';
import { ToastProvider } from '@/shared/ui/Toast';

const mockUpdateProfile = vi.fn();
const mockGetUserProfile = vi.fn();
const mockUpdateUserProfile = vi.fn();
const mockUploadProfilePhoto = vi.fn();
const mockGetFollowStatus = vi.fn();
const mockGetAccountVisibilityServer = vi.fn();
const mockSendFollowRequest = vi.fn();
const mockAcceptFollowRequest = vi.fn();
const mockDeclineFollowRequest = vi.fn();
const mockCancelFollowRequest = vi.fn();
const mockFollowPublicUser = vi.fn();
const mockUnfollowUser = vi.fn();
const mockUnblockUser = vi.fn();
const mockIsUserBlocked = vi.fn();
const mockGetBlockedUsers = vi.fn();
const mockGetFollowList = vi.fn();
const mockGetIncomingFollowRequests = vi.fn();
const mockGetUserContributions = vi.fn();
const mockCreateContribution = vi.fn();
const mockDeleteContribution = vi.fn();
const mockUpdateContributionFile = vi.fn();

const mockAuthUser = {
  uid: 'user_1',
  displayName: 'Alice',
  photoURL: null,
};

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}));

vi.mock('firebase/auth', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: null },
}));

vi.mock('@/shared/lib/storage', () => ({
  uploadProfilePhoto: (...args: unknown[]) => mockUploadProfilePhoto(...args),
  uploadContributionFile: vi.fn(),
}));

vi.mock('@/shared/lib/compression', () => ({
  compressToWebp: vi.fn(),
}));

vi.mock('@/features/posts/components/ProfilePostsGrid', () => ({
  default: () => <div data-testid="profile-posts-grid" />,
}));

vi.mock('@/features/profile/api', () => ({
  getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
  updateUserProfile: (...args: unknown[]) => mockUpdateUserProfile(...args),
  getFollowStatus: (...args: unknown[]) => mockGetFollowStatus(...args),
  getAccountVisibilityServer: (...args: unknown[]) => mockGetAccountVisibilityServer(...args),
  sendFollowRequest: (...args: unknown[]) => mockSendFollowRequest(...args),
  acceptFollowRequest: (...args: unknown[]) => mockAcceptFollowRequest(...args),
  declineFollowRequest: (...args: unknown[]) => mockDeclineFollowRequest(...args),
  cancelFollowRequest: (...args: unknown[]) => mockCancelFollowRequest(...args),
  followPublicUser: (...args: unknown[]) => mockFollowPublicUser(...args),
  unfollowUser: (...args: unknown[]) => mockUnfollowUser(...args),
  unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
  isUserBlocked: (...args: unknown[]) => mockIsUserBlocked(...args),
  getBlockedUsers: (...args: unknown[]) => mockGetBlockedUsers(...args),
  getFollowList: (...args: unknown[]) => mockGetFollowList(...args),
  getIncomingFollowRequests: (...args: unknown[]) => mockGetIncomingFollowRequests(...args),
  getUserContributions: (...args: unknown[]) => mockGetUserContributions(...args),
  createContribution: (...args: unknown[]) => mockCreateContribution(...args),
  deleteContribution: (...args: unknown[]) => mockDeleteContribution(...args),
  updateContributionFile: (...args: unknown[]) => mockUpdateContributionFile(...args),
  getOrCreateDirectConversation: vi.fn(),
}));

describe('Perfiles y seguidores flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserContributions.mockResolvedValue([]);
    mockGetBlockedUsers.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('EditProfileModal clears bio, role and location with null and blocks empty names', async () => {
    mockGetUserProfile.mockResolvedValue({
      uid: 'user_1',
      displayName: 'Alice V.',
      photoURL: null,
      bio: 'Bio inicial',
      role: 'Investigator',
      location: 'Lima',
      accountVisibility: 'public',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
    });
    mockUpdateUserProfile.mockResolvedValue(undefined);
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ToastProvider>
        <EditProfileModal isOpen onClose={onClose} onSave={onSave} />
      </ToastProvider>,
    );

    const nameInput = await screen.findByPlaceholderText('Tu nombre');
    const roleInput = screen.getByPlaceholderText(/Desarrollador/i);
    const locationInput = screen.getByPlaceholderText(/Lima, Perú/i);
    const bioInput = screen.getByPlaceholderText(/Cuéntale al mundo/i);

    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.submit(nameInput.closest('form')!);
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: 'Alice Editada' } });
    fireEvent.change(roleInput, { target: { value: '   ' } });
    fireEvent.change(locationInput, { target: { value: '' } });
    fireEvent.change(bioInput, { target: { value: '' } });
    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith('user_1', {
        displayName: 'Alice Editada',
        photoURL: undefined,
        bio: null,
        role: null,
        location: null,
      });
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('EditProfileModal resets to loading state when reopened and clears stale bio cleanly', async () => {
    let resolveSecondLoad!: (value: Record<string, unknown>) => void;
    const secondLoadPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveSecondLoad = resolve;
    });

    mockGetUserProfile
      .mockResolvedValueOnce({
        uid: 'user_1',
        displayName: 'Alice V.',
        photoURL: null,
        bio: 'Bio inicial',
        role: null,
        location: null,
        accountVisibility: 'public',
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
      })
      .mockImplementationOnce(() => secondLoadPromise);
    mockUpdateUserProfile.mockResolvedValue(undefined);

    const onClose = vi.fn();
    const view = render(
      <ToastProvider>
        <EditProfileModal isOpen onClose={onClose} />
      </ToastProvider>,
    );

    const firstBioInput = await screen.findByPlaceholderText(/Cuéntale al mundo/i);
    expect((firstBioInput as HTMLTextAreaElement).value).toBe('Bio inicial');

    view.rerender(
      <ToastProvider>
        <EditProfileModal isOpen={false} onClose={onClose} />
      </ToastProvider>,
    );
    view.rerender(
      <ToastProvider>
        <EditProfileModal isOpen onClose={onClose} />
      </ToastProvider>,
    );

    // Must not expose stale form fields while the fresh profile fetch is still pending.
    expect(screen.queryByPlaceholderText(/Cuéntale al mundo/i)).toBeNull();

    resolveSecondLoad({
      uid: 'user_1',
      displayName: 'Alice V.',
      photoURL: null,
      bio: 'Bio temporal 2',
      role: null,
      location: null,
      accountVisibility: 'public',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
    });

    const reopenedBioInput = await screen.findByPlaceholderText(/Cuéntale al mundo/i);
    expect((reopenedBioInput as HTMLTextAreaElement).value).toBe('Bio temporal 2');
    fireEvent.change(reopenedBioInput, { target: { value: '' } });
    fireEvent.submit(reopenedBioInput.closest('form')!);

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith('user_1', {
        displayName: 'Alice V.',
        photoURL: undefined,
        bio: null,
        role: null,
        location: null,
      });
    });
  });

  it('ContributionsSection allows deleting own contribution and filters unsafe URLs', async () => {
    mockGetUserContributions.mockResolvedValueOnce([
      {
        id: 'contrib_1',
        userId: 'user_1',
        type: 'project',
        title: 'Quantum Notes',
        description: 'Resumen',
        categoryId: 'science',
        link: 'javascript:alert(1)',
        fileUrl: 'https://cdn.example.com/notes.pdf',
        filePath: 'contributions/user_1/contrib_1/notes.pdf',
        fileName: 'notes.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    mockDeleteContribution.mockResolvedValueOnce(undefined);

    render(
      <ToastProvider>
        <ContributionsSection userId="user_1" canEdit />
      </ToastProvider>,
    );

    expect(await screen.findByText('Quantum Notes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver enlace/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notes\.pdf/i })).toHaveAttribute(
      'href',
      'https://cdn.example.com/notes.pdf',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Quantum Notes' }));

    await waitFor(() => {
      expect(mockDeleteContribution).toHaveBeenCalledWith(
        'contrib_1',
        'contributions/user_1/contrib_1/notes.pdf',
      );
      expect(screen.queryByText('Quantum Notes')).not.toBeInTheDocument();
    });
  });

  it('UserProfilePage shows incoming requests while following, recovers PERMISSION_DENIED privacy mismatch, and omits false visitor placeholders', async () => {
    mockGetUserProfile.mockResolvedValue({
      uid: 'user_2',
      displayName: 'Bob Privado',
      photoURL: null,
      bio: null,
      role: null,
      location: null,
      accountVisibility: 'public',
      followersCount: 1,
      followingCount: 2,
      postsCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockIsUserBlocked.mockResolvedValue(false);
    mockGetFollowStatus.mockResolvedValue({
      status: 'following',
      isMutual: false,
      hasIncomingRequest: true,
      incomingRequestId: 'user_2_user_1',
    });
    mockAcceptFollowRequest.mockResolvedValueOnce(undefined);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/user/user_2']}>
          <Routes>
            <Route path="/user/:userId" element={<UserProfilePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Bob Privado' })).toBeInTheDocument();
    expect(screen.queryByText('Sin biografía aún.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nuevo miembro')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin ubicación')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Siguiendo' })).toBeInTheDocument();
    const acceptButton = screen.getByRole('button', { name: 'Aceptar solicitud' });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockAcceptFollowRequest).toHaveBeenCalledWith('user_2', 'user_1');
      expect(screen.queryByRole('button', { name: 'Aceptar solicitud' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Siguiendo' })).toBeInTheDocument();

    // Unfollow then re-follow with stale public visibility hitting PERMISSION_DENIED fallback
    mockUnfollowUser.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiendo' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument();
    });

    mockGetAccountVisibilityServer.mockResolvedValueOnce('public').mockResolvedValueOnce('private');
    mockCancelFollowRequest.mockResolvedValueOnce(undefined);
    mockFollowPublicUser.mockRejectedValueOnce(new AppError('Denied', 'PERMISSION_DENIED'));
    mockSendFollowRequest.mockResolvedValueOnce('user_1_user_2');

    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
    await waitFor(() => {
      expect(mockSendFollowRequest).toHaveBeenCalledWith('user_1', 'user_2');
      expect(screen.getByRole('button', { name: 'Pendiente' })).toBeInTheDocument();
    });
  });

  it('UserProfilePage shows unblock action when user is blocked and restores follow controls on unblock', async () => {
    mockGetUserProfile.mockResolvedValue({
      uid: 'user_blocked',
      displayName: 'Usuario Bloqueado',
      photoURL: null,
      bio: null,
      role: null,
      location: null,
      accountVisibility: 'public',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockIsUserBlocked.mockResolvedValueOnce(true);
    mockUnblockUser.mockResolvedValueOnce(undefined);
    mockGetFollowStatus.mockResolvedValueOnce({ status: 'none', isMutual: false });

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/user/user_blocked']}>
          <Routes>
            <Route path="/user/:userId" element={<UserProfilePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    const unblockButton = await screen.findByRole('button', { name: 'Desbloquear usuario' });
    fireEvent.click(unblockButton);

    await waitFor(() => {
      expect(mockUnblockUser).toHaveBeenCalledWith('user_1', 'user_blocked');
      expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument();
    });
  });

  it('FollowListPage filters blocked users, displays private list error cleanly, and shows accepted follower immediately', async () => {
    mockGetUserProfile.mockResolvedValue({
      uid: 'user_1',
      displayName: 'Alice',
    });
    mockGetBlockedUsers.mockResolvedValue(['user_blocked']);
    mockGetFollowList.mockResolvedValueOnce({
      items: [
        { uid: 'user_ok', displayName: 'Carla', photoURL: null, username: 'carla' },
        { uid: 'user_blocked', displayName: 'Bloqueado', photoURL: null, username: 'bad' },
      ],
      lastDoc: null,
      hasMore: false,
    });
    mockGetIncomingFollowRequests.mockResolvedValueOnce({
      items: [
        {
          id: 'user_req_user_1',
          fromUid: 'user_req',
          toUid: 'user_1',
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
          fromUser: {
            uid: 'user_req',
            displayName: 'Diego Solicitud',
            photoURL: null,
            username: null,
          },
        },
      ],
      lastDoc: null,
      hasMore: false,
    });
    mockAcceptFollowRequest.mockResolvedValueOnce(undefined);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/user/user_1/connections?tab=followers']}>
          <Routes>
            <Route path="/user/:userId/connections" element={<FollowListPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByText('Carla')).toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();
    expect(screen.getByText('Diego Solicitud')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => {
      expect(mockAcceptFollowRequest).toHaveBeenCalledWith('user_req', 'user_1');
      expect(screen.getByText('Diego Solicitud')).toBeInTheDocument();
    });

    cleanup();

    // Private list denial renders explicit privacy message
    mockGetUserProfile.mockResolvedValueOnce({ uid: 'user_private', displayName: 'Private' });
    mockGetFollowList.mockRejectedValueOnce(new AppError('Private', 'PERMISSION_DENIED'));
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/user/user_private/connections?tab=followers']}>
          <Routes>
            <Route path="/user/:userId/connections" element={<FollowListPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByText('Esta lista de conexiones es privada.')).toBeInTheDocument();
  });
});
