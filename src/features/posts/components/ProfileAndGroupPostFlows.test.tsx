import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePostsGrid from '@/features/posts/components/ProfilePostsGrid';
import PostDetailPage from '@/features/posts/pages/PostDetailPage';
import GroupDetailContainer from '@/features/groups/components/GroupDetailContainer';
import { FEED_CACHE_INVALIDATED_EVENT } from '@/features/posts/model/feedCache';
import { ToastProvider } from '@/shared/ui/Toast';

const mockGetPostsByUser = vi.fn();
const mockGetPost = vi.fn();
const mockGetGroup = vi.fn();
const mockGetGroupMemberCount = vi.fn();
const mockGetGroupPostsWeekCount = vi.fn();
const mockGetGroupJoinStatus = vi.fn();
const mockGetPostsByGroup = vi.fn();
const mockGetGroupMembers = vi.fn();

const mockAuthUser = {
  uid: 'user_1',
  displayName: 'Alice',
  photoURL: null,
  isAnonymous: false,
};

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}));

vi.mock('@/features/posts/api', () => ({
  getPostsByUser: (...args: unknown[]) => mockGetPostsByUser(...args),
  getPost: (...args: unknown[]) => mockGetPost(...args),
  // The post page lists its comments under the post.
  getPostComments: vi.fn(async () => ({ items: [], lastDoc: null, hasMore: false })),
  addPostComment: vi.fn(),
  getNewPostId: vi.fn(),
  createPostReport: vi.fn(),
  createPostCommentReport: vi.fn(),
}));

vi.mock('@/features/groups/api', () => ({
  getGroup: (...args: unknown[]) => mockGetGroup(...args),
  getBlockedUsers: vi.fn(async () => []),
  getGroupMemberCount: (...args: unknown[]) => mockGetGroupMemberCount(...args),
  getGroupPostsWeekCount: (...args: unknown[]) => mockGetGroupPostsWeekCount(...args),
  getGroupJoinStatus: (...args: unknown[]) => mockGetGroupJoinStatus(...args),
  getPostsByGroup: (...args: unknown[]) => mockGetPostsByGroup(...args),
  getGroupMembers: (...args: unknown[]) => mockGetGroupMembers(...args),
  getGroupMembersPage: vi.fn(),
  getOrCreateGroupConversation: vi.fn(),
  getUserProfile: vi.fn(async () => ({ displayName: 'Alice', photoURL: null })),
  joinPublicGroup: vi.fn(),
  leaveGroupWithSync: vi.fn(),
  sendGroupJoinRequest: vi.fn(),
  updateGroupMemberRole: vi.fn(),
  removeGroupMember: vi.fn(),
}));

vi.mock('@/features/posts/hooks/usePostEngagement', () => ({
  usePostEngagement: () => ({
    like: { value: false, count: 3, loaded: true, loading: false, error: null },
    save: { value: false, count: 0, loaded: true, loading: false, error: null },
    act: vi.fn(),
  }),
}));

vi.mock('@/features/posts/components/CreatePostModal', () => ({
  default: ({
    isOpen,
    onClose,
    groupId,
    categoryId,
    redirectTo,
  }: {
    isOpen: boolean;
    onClose: () => void;
    groupId?: string | null;
    categoryId?: string | null;
    redirectTo?: string | null;
  }) =>
    isOpen ? (
      <div
        role="dialog"
        data-testid="mock-create-post-modal"
        data-group-id={groupId ?? ''}
        data-category-id={categoryId ?? ''}
        data-redirect-to={String(redirectTo)}
      >
        <button type="button" onClick={onClose}>
          Cerrar modal
        </button>
      </div>
    ) : null,
}));

vi.mock('@/features/posts/components/PostCommentsModal', () => ({
  default: () => null,
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

describe('Profile, Group, and Post Detail flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows creating a post from own profile, refreshes on cache invalidation, and opens post detail', async () => {
    mockGetPostsByUser
      .mockResolvedValueOnce({
        items: [],
        lastDoc: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'post_profile_1',
            postId: 'post_profile_1',
            authorId: 'user_1',
            title: 'Publicación creada desde perfil',
            text: 'Contenido del perfil',
            status: 'ready',
            media: [],
            createdAt: new Date(),
          },
        ],
        lastDoc: null,
        hasMore: false,
      });

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <ToastProvider>
          <LocationDisplay />
          <Routes>
            <Route path="/profile" element={<ProfilePostsGrid userId="user_1" canView={true} />} />
            <Route path="/post/:postId" element={<div>Vista de detalle</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Aún no hay publicaciones.')).toBeInTheDocument();
    });

    const publishButton = screen.getByRole('button', { name: /Publicar/i });
    fireEvent.click(publishButton);

    const modal = screen.getByTestId('mock-create-post-modal');
    expect(modal).toHaveAttribute('data-redirect-to', 'null');

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FEED_CACHE_INVALIDATED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByText('Publicación creada desde perfil')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Publicación creada desde perfil'));
    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/post/post_profile_1');
    });
  });

  it('refreshes group recent posts and navigates to /post/:postId when opening a group post', async () => {
    const nowTimestamp = { toDate: () => new Date() };
    mockGetGroup.mockResolvedValue({
      id: 'group_1',
      name: 'Mecánica Cuántica',
      description: 'Grupo de física',
      categoryId: 'science',
      ownerId: 'user_1',
      visibility: 'public',
      memberCount: 2,
    });
    mockGetGroupMemberCount.mockResolvedValue(2);
    mockGetGroupPostsWeekCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockGetGroupJoinStatus.mockResolvedValue('member');
    mockGetGroupMembers.mockResolvedValue([]);
    mockGetPostsByGroup
      .mockResolvedValueOnce({
        items: [
          {
            id: 'post_group_1',
            title: 'Experimento de doble rendija',
            text: 'Resultados del laboratorio',
            authorSnapshot: { displayName: 'Alice' },
            createdAt: nowTimestamp,
          },
        ],
        lastDoc: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'post_group_2',
            title: 'Entrelazamiento cuántico',
            text: 'Nueva publicación del grupo',
            authorSnapshot: { displayName: 'Alice' },
            createdAt: nowTimestamp,
          },
          {
            id: 'post_group_1',
            title: 'Experimento de doble rendija',
            text: 'Resultados del laboratorio',
            authorSnapshot: { displayName: 'Alice' },
            createdAt: nowTimestamp,
          },
        ],
        lastDoc: null,
        hasMore: false,
      });

    render(
      <MemoryRouter initialEntries={['/group/group_1']}>
        <ToastProvider>
          <LocationDisplay />
          <Routes>
            <Route path="/group/:groupId" element={<GroupDetailContainer />} />
            <Route path="/post/:postId" element={<div>Detalle del post de grupo</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Experimento de doble rendija')).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(FEED_CACHE_INVALIDATED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByText('Entrelazamiento cuántico')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Abrir publicacion: Entrelazamiento cuántico/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/post/post_group_2');
    });
  });

  it('shows the whole text of a post without a title as its body, not as a heading', async () => {
    mockGetPost.mockResolvedValue({
      id: 'post_multiline',
      postId: 'post_multiline',
      authorId: 'user_1',
      authorSnapshot: { displayName: 'Alice', photoURL: null },
      title: null,
      text: 'Primera línea como encabezado\n\nSegunda línea del cuerpo completo.',
      media: [],
      likeCount: 3,
      commentCount: 0,
      createdAt: new Date(),
    });

    render(
      <MemoryRouter initialEntries={['/post/post_multiline']}>
        <ToastProvider>
          <Routes>
            <Route path="/post/:postId" element={<PostDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Primera línea como encabezado')).toBeInTheDocument();
    expect(screen.getByText('Segunda línea del cuerpo completo.')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Primera línea como encabezado' }),
    ).not.toBeInTheDocument();
    // The comments are on the page, under the post.
    expect(await screen.findByRole('heading', { name: 'Comentarios (0)' })).toBeInTheDocument();
    expect(await screen.findByText('No hay comentarios aun.')).toBeInTheDocument();
  });
});
