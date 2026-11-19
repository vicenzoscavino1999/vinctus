import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/Toast';

const mockUser = {
  uid: 'user_1',
  displayName: 'Alice V.',
  photoURL: null,
};

const mockGetGroups = vi.fn();
const mockGetGroupsByCategory = vi.fn();
const mockGetGroupJoinStatus = vi.fn();
const mockJoinPublicGroup = vi.fn();
const mockSendGroupJoinRequest = vi.fn();
const mockGetPublicArenaDebates = vi.fn();
const mockGetGlobalFeed = vi.fn();
const mockFetchYouTubeSearchVideos = vi.fn();
const mockFetchArxivPapers = vi.fn();
const mockFetchWikipediaArticles = vi.fn();
const mockFetchHackerNews = vi.fn();
const mockFetchBooks = vi.fn();
const mockFetchNatureObservations = vi.fn();
const mockFetchMusicInfo = vi.fn();
const mockGetBlockedUsers = vi.fn();
const mockGetContributionsByCategory = vi.fn();
const mockGetUserProfile = vi.fn();
const mockGetRecentUsers = vi.fn();
const mockSearchUsersByDisplayName = vi.fn();
const mockGetFollowStatus = vi.fn();

vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/context/app-state', () => ({
  useAppState: () => ({
    toggleSaveCategory: vi.fn(),
    isCategorySaved: () => false,
    followedCategories: [],
    toggleFollowCategory: vi.fn(),
    isCategoryFollowed: () => false,
  }),
}));

vi.mock('@/features/posts/components/StoriesWidget', () => ({
  default: () => <div data-testid="stories-widget-stub" />,
}));

vi.mock('@/features/discover/components/DiscoverPostActions', () => ({
  default: () => <div data-testid="discover-post-actions-stub" />,
}));

vi.mock('@/features/groups/api', () => ({
  getGroups: (...args: unknown[]) => mockGetGroups(...args),
  getGroupsByCategory: (...args: unknown[]) => mockGetGroupsByCategory(...args),
  getGroupJoinStatus: (...args: unknown[]) => mockGetGroupJoinStatus(...args),
  joinPublicGroup: (...args: unknown[]) => mockJoinPublicGroup(...args),
  sendGroupJoinRequest: (...args: unknown[]) => mockSendGroupJoinRequest(...args),
}));

vi.mock('@/features/arena/api/queries', () => ({
  getPublicArenaDebates: (...args: unknown[]) => mockGetPublicArenaDebates(...args),
}));

vi.mock('@/features/posts/api', () => ({
  getGlobalFeed: (...args: unknown[]) => mockGetGlobalFeed(...args),
}));

vi.mock('@/shared/lib/youtubeSearchApi', () => ({
  fetchYouTubeSearchVideos: (...args: unknown[]) => mockFetchYouTubeSearchVideos(...args),
}));

vi.mock('@/shared/lib/api', () => ({
  fetchArxivPapers: (...args: unknown[]) => mockFetchArxivPapers(...args),
  fetchWikipediaArticles: (...args: unknown[]) => mockFetchWikipediaArticles(...args),
  fetchHackerNews: (...args: unknown[]) => mockFetchHackerNews(...args),
  fetchBooks: (...args: unknown[]) => mockFetchBooks(...args),
  fetchNatureObservations: (...args: unknown[]) => mockFetchNatureObservations(...args),
  fetchMusicInfo: (...args: unknown[]) => mockFetchMusicInfo(...args),
}));

vi.mock('@/features/profile/api', () => ({
  getBlockedUsers: (...args: unknown[]) => mockGetBlockedUsers(...args),
  getContributionsByCategory: (...args: unknown[]) => mockGetContributionsByCategory(...args),
  getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
  getRecentUsers: (...args: unknown[]) => mockGetRecentUsers(...args),
  searchUsersByDisplayName: (...args: unknown[]) => mockSearchUsersByDisplayName(...args),
  getFollowStatus: (...args: unknown[]) => mockGetFollowStatus(...args),
  getAccountVisibilityServer: vi.fn(),
  sendFollowRequest: vi.fn(),
  acceptFollowRequest: vi.fn(),
  declineFollowRequest: vi.fn(),
  cancelFollowRequest: vi.fn(),
  followPublicUser: vi.fn(),
  unfollowUser: vi.fn(),
  isUserBlocked: vi.fn(),
  getOrCreateDirectConversation: vi.fn(),
}));

import DiscoverPage from '@/features/discover/pages/DiscoverPage';
import CategoryPage from '@/features/discover/pages/CategoryPage';
import UserSearchPage from '@/features/discover/pages/UserSearchPage';

describe('Discover and Search flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockGetGroups.mockResolvedValue([
      {
        id: 'g1',
        name: 'Física Cuántica Hoy',
        description: 'Grupo de física moderna',
        categoryId: 'science',
        visibility: 'public',
        ownerId: 'owner_1',
        memberCount: 25,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'g2',
        name: 'Club de Jazz',
        description: 'Discos y vinilos',
        categoryId: 'music',
        visibility: 'public',
        ownerId: 'owner_2',
        memberCount: 15,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    mockGetGroupsByCategory.mockResolvedValue([]);
    mockGetGroupJoinStatus.mockResolvedValue('none');
    mockGetPublicArenaDebates.mockResolvedValue([]);
    mockGetGlobalFeed.mockResolvedValue({ items: [], lastDoc: null, hasMore: false });
    mockFetchYouTubeSearchVideos.mockResolvedValue({ items: [], nextPageToken: null });
    mockFetchArxivPapers.mockResolvedValue([]);
    mockFetchWikipediaArticles.mockResolvedValue([]);
    mockFetchHackerNews.mockResolvedValue([]);
    mockFetchBooks.mockResolvedValue([]);
    mockFetchNatureObservations.mockResolvedValue([]);
    mockFetchMusicInfo.mockResolvedValue([]);
    mockGetBlockedUsers.mockResolvedValue([]);
    mockGetContributionsByCategory.mockResolvedValue([]);
    mockGetUserProfile.mockResolvedValue(null);
    mockGetRecentUsers.mockResolvedValue([]);
    mockSearchUsersByDisplayName.mockResolvedValue([]);
    mockGetFollowStatus.mockResolvedValue({ status: 'none', isMutual: false });
  });

  it('DiscoverPage filters categories and groups accent-insensitively and honors sort filters', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/discover']}>
          <Routes>
            <Route path="/discover" element={<DiscoverPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByText('Física Cuántica Hoy')).toBeInTheDocument();
    expect(screen.getByText('Club de Jazz')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Buscar intereses o grupos');
    fireEvent.change(searchInput, { target: { value: 'fisica' } });

    await waitFor(() => {
      expect(screen.getByText('Física Cuántica Hoy')).toBeInTheDocument();
      expect(screen.queryByText('Club de Jazz')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Limpiar búsqueda'));
    await waitFor(() => {
      expect(screen.getByText('Club de Jazz')).toBeInTheDocument();
    });

    // Applying A-Z sort in SearchFilters orders categories alphabetically (Acústica & Arte first).
    fireEvent.click(screen.getByLabelText('Abrir filtros'));
    fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver resultados' }));

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
      expect(headings[0]).toBe('Acústica & Arte');
    });
  });

  it('CategoryPage retries live content in place, filters blocked authors in Biblioteca, and rejects unsafe links', async () => {
    mockFetchArxivPapers.mockRejectedValueOnce(new Error('arXiv down')).mockResolvedValueOnce([
      {
        id: '2401.0001',
        title: 'Quantum Paper Recovered',
        summary: 'Summary text',
        authors: 'A. Einstein',
        published: '2026-01-10',
        link: 'https://arxiv.org/abs/2401.0001',
        type: 'Paper',
      },
    ]);
    mockGetBlockedUsers.mockResolvedValue(['blocked_uid']);
    mockGetContributionsByCategory.mockResolvedValue([
      {
        id: 'c_blocked',
        userId: 'blocked_uid',
        type: 'paper',
        title: 'Blocked Author Work',
        description: 'Must stay hidden',
        categoryId: 'science',
        link: 'https://example.com/blocked',
        fileUrl: null,
        filePath: null,
        fileName: null,
        fileSize: null,
        fileType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c_visible',
        userId: 'good_uid',
        type: 'project',
        title: 'Visible Science Paper',
        description: 'Allowed item',
        categoryId: 'science',
        link: 'javascript:alert(1)',
        fileUrl: 'https://cdn.example.com/paper.pdf',
        filePath: null,
        fileName: 'paper.pdf',
        fileSize: 100,
        fileType: 'application/pdf',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockGetUserProfile.mockResolvedValue({ displayName: 'Dra. Curie', photoURL: null });

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/category/science']}>
          <Routes>
            <Route path="/category/:categoryId" element={<CategoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByText('arXiv down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(await screen.findByText('Quantum Paper Recovered')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
    expect(await screen.findByText('Visible Science Paper')).toBeInTheDocument();
    expect(screen.queryByText('Blocked Author Work')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver enlace/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /paper\.pdf/i })).toHaveAttribute(
      'href',
      'https://cdn.example.com/paper.pdf',
    );
  });

  it('UserSearchPage hides blocked users, shows matching groups, and recovers suggested-user errors', async () => {
    mockGetBlockedUsers.mockResolvedValue(['blocked_u']);
    mockGetRecentUsers.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
      {
        uid: 'blocked_u',
        displayName: 'Usuario Bloqueado',
        photoURL: null,
        accountVisibility: 'public',
      },
      { uid: 'open_u', displayName: 'Bruno Visible', photoURL: null, accountVisibility: 'public' },
    ]);
    mockSearchUsersByDisplayName.mockResolvedValue([
      {
        uid: 'blocked_u',
        displayName: 'Fisico Bloqueado',
        photoURL: null,
        accountVisibility: 'public',
      },
      { uid: 'good_u', displayName: 'Fisico Visible', photoURL: null, accountVisibility: 'public' },
    ]);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/search']}>
          <Routes>
            <Route path="/search" element={<UserSearchPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(
      await screen.findByText('No se pudieron cargar los usuarios sugeridos.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Bruno Visible')).toBeInTheDocument();
    expect(screen.queryByText('Usuario Bloqueado')).not.toBeInTheDocument();

    const searchInput = screen.getByLabelText('Buscar usuarios');
    fireEvent.change(searchInput, { target: { value: 'fisic' } });

    expect(await screen.findByText('Fisico Visible')).toBeInTheDocument();
    expect(screen.queryByText('Fisico Bloqueado')).not.toBeInTheDocument();
    expect(screen.getByText('Física Cuántica Hoy')).toBeInTheDocument();
  });
});
