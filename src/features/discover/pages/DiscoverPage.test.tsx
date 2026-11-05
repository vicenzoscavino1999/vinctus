import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FirestoreGroup } from '@/features/groups/api';
import {
  getGroupJoinStatus,
  getGroups,
  joinPublicGroup,
  sendGroupJoinRequest,
} from '@/features/groups/api';
import { getPublicArenaDebates } from '@/features/arena/api/queries';
import type { Debate } from '@/features/arena/types';
import { getGlobalFeed, type PostRead } from '@/features/posts/api';
import { fetchArxivPapers, fetchMusicInfo } from '@/shared/lib/api';
import { fetchYouTubeSearchVideos, type YouTubeSearchVideo } from '@/shared/lib/youtubeSearchApi';
import DiscoverPage from './DiscoverPage';

const appState = {
  toggleSaveCategory: vi.fn(),
  isCategorySaved: vi.fn(() => false),
  followedCategories: [] as string[],
  toggleFollowCategory: vi.fn(),
  isCategoryFollowed: vi.fn(() => false),
  toggleLikePost: vi.fn(),
  isPostLiked: vi.fn(() => false),
  toggleSavePost: vi.fn(),
  isPostSaved: vi.fn(() => false),
};
const showToast = vi.fn();

vi.mock('@/context/app-state', () => ({ useAppState: () => appState }));
vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1', displayName: 'Ana', photoURL: null } }),
}));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/features/posts/components/StoriesWidget', () => ({ default: () => null }));
vi.mock('@/shared/lib/api', () => ({
  fetchArxivPapers: vi.fn(async () => []),
  fetchBooks: vi.fn(async () => []),
  fetchHackerNews: vi.fn(async () => []),
  fetchMusicInfo: vi.fn(async () => []),
  fetchNatureObservations: vi.fn(async () => []),
  fetchWikipediaArticles: vi.fn(async () => []),
}));
vi.mock('@/features/groups/api', () => ({
  getGroups: vi.fn(),
  getGroupJoinStatus: vi.fn(),
  joinPublicGroup: vi.fn(),
  sendGroupJoinRequest: vi.fn(),
}));
vi.mock('@/features/arena/api/queries', () => ({ getPublicArenaDebates: vi.fn() }));
vi.mock('@/features/posts/api', () => ({ getGlobalFeed: vi.fn() }));
vi.mock('@/shared/lib/youtubeSearchApi', () => ({ fetchYouTubeSearchVideos: vi.fn() }));

class IntersectionObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

const group = (overrides: Partial<FirestoreGroup>): FirestoreGroup =>
  ({
    id: 'g',
    name: 'Grupo',
    description: null,
    categoryId: 'science',
    memberCount: 0,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ownerId: 'owner',
    visibility: 'public',
    iconUrl: null,
    ...overrides,
  }) as FirestoreGroup;

const debate = (overrides: Partial<Debate>): Debate =>
  ({
    id: 'd',
    topic: 'Debate',
    personaA: 'unknown-a',
    personaB: 'unknown-b',
    status: 'done',
    sourceCount: 1,
    likesCount: 0,
    sourceLinks: [],
    sourceMentions: [],
    summary: null,
    createdAt: new Date('2026-10-02T00:00:00Z'),
    ...overrides,
  }) as unknown as Debate;

const post = (overrides: Partial<PostRead>): PostRead =>
  ({
    id: 'p',
    title: 'Post',
    text: 'Texto del post',
    content: '',
    media: [],
    authorName: 'Autor',
    authorSnapshot: null,
    categoryId: 'science',
    likeCount: 2,
    commentCount: 1,
    ...overrides,
  }) as unknown as PostRead;

const video = (overrides: Partial<YouTubeSearchVideo>): YouTubeSearchVideo => ({
  channelId: 'c1',
  channelTitle: 'Canal',
  description: 'Descripcion del video',
  embedUrl: 'https://www.youtube.com/embed/v',
  liveBroadcastContent: null,
  publishedAt: '2026-10-03T00:00:00Z',
  thumbnailUrl: 'https://img.example/v.jpg',
  title: 'Video',
  videoId: 'v',
  watchUrl: 'https://www.youtube.com/watch?v=v',
  ...overrides,
});

const renderPage = (initialEntry = '/discover') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DiscoverPage />
    </MemoryRouter>,
  );

const feedArticles = () =>
  within(screen.getByText('Feed social en Discover').closest('.rounded-card') as HTMLElement)
    .queryAllByRole('article')
    .filter((element) => element.tagName === 'ARTICLE');

describe('DiscoverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
    vi.mocked(getGroups).mockResolvedValue([
      group({ id: 'g1', name: 'Fisicos', memberCount: 50, visibility: 'public' }),
      group({ id: 'g2', name: 'Lectores', memberCount: 40, visibility: 'private' }),
      group({ id: 'g3', name: 'Musicos', memberCount: 30 }),
      group({ id: 'g4', name: 'Naturalistas', memberCount: 20 }),
      group({ id: 'g5', name: 'Quinto grupo', memberCount: 10 }),
    ]);
    vi.mocked(getGroupJoinStatus).mockResolvedValue('none');
    vi.mocked(joinPublicGroup).mockResolvedValue(undefined as never);
    vi.mocked(sendGroupJoinRequest).mockResolvedValue(undefined as never);
    vi.mocked(getPublicArenaDebates).mockResolvedValue([
      debate({ id: 'd1', topic: 'Debate con fuentes', sourceCount: 3, likesCount: 2 }),
      debate({ id: 'd2', topic: 'Debate sin fuentes', sourceCount: 0 }),
      debate({ id: 'd3', topic: 'Debate en curso', status: 'running' as Debate['status'] }),
    ]);
    vi.mocked(getGlobalFeed).mockResolvedValue({
      items: [post({ id: 'p1', title: 'Post de la comunidad' })],
      lastDoc: 'cursor-1' as never,
      hasMore: true,
    } as never);
    vi.mocked(fetchYouTubeSearchVideos).mockResolvedValue({
      items: [video({ videoId: 'yt1', title: 'Video de YouTube' })],
      nextPageToken: 'page-2',
    } as never);
    vi.mocked(fetchArxivPapers).mockResolvedValue([
      { id: 'a1', title: 'Paper reciente', authors: 'Curie', published: '2026', link: '' },
    ] as never);
  });

  it('renders trends, curated debates, top groups and a mixed publication feed', async () => {
    renderPage();

    expect(await screen.findByText('Debate con fuentes')).toBeInTheDocument();
    expect(screen.queryByText('Debate sin fuentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Debate en curso')).not.toBeInTheDocument();

    expect(await screen.findByText('Fisicos')).toBeInTheDocument();
    expect(screen.getByText('Naturalistas')).toBeInTheDocument();
    expect(screen.queryByText('Quinto grupo')).not.toBeInTheDocument();

    // Desktop and mobile trend layouts both render; the featured card is Top 1 in each.
    expect(screen.getAllByText('Top 1').length).toBeGreaterThanOrEqual(1);

    await screen.findByText('Post de la comunidad');
    expect(screen.getByText('Video de YouTube')).toBeInTheDocument();
    await waitFor(() => expect(feedArticles()).toHaveLength(6));
    expect(screen.getAllByText('Editorial').length).toBeGreaterThan(0);
  });

  it('previews the first trend card and switches the preview on hover', async () => {
    vi.mocked(fetchMusicInfo).mockResolvedValue([
      { id: 't1', title: 'Tema en vivo', artist: 'Trio', listeners: '10', link: '' },
    ] as never);
    renderPage();

    // With no signals loaded yet the cards tie and sort by label, so the first one is
    // "Acústica & Arte" (music), and it stays selected while it is in the top four.
    expect((await screen.findAllByText('Tema en vivo')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Paper reciente')).not.toBeInTheDocument();

    const scienceCard = screen.getAllByRole('heading', { name: 'Ciencia & Materia' })[0];
    fireEvent.mouseEnter(scienceCard.closest('article') as HTMLElement);

    expect((await screen.findAllByText('Paper reciente')).length).toBeGreaterThan(0);
    expect(fetchArxivPapers).toHaveBeenCalledTimes(1);
  });

  it('opens the YouTube player for a video and closes it with Escape', async () => {
    renderPage();

    const videoTitle = await screen.findByText('Video de YouTube');
    fireEvent.click(videoTitle.closest('button') as HTMLButtonElement);

    const player = await screen.findByTitle('Video de YouTube');
    expect(player.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/yt1?rel=0');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTitle('Video de YouTube')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
  });

  it('joins a public group and requests to join a private one', async () => {
    renderPage();

    const publicCard = (await screen.findByText('Fisicos')).closest('[role="button"]')!;
    await waitFor(() => expect(getGroupJoinStatus).toHaveBeenCalledTimes(4));
    fireEvent.click(within(publicCard as HTMLElement).getByRole('button', { name: 'Unirme' }));
    await within(publicCard as HTMLElement).findByRole('button', { name: 'Unido' });
    expect(joinPublicGroup).toHaveBeenCalledWith('g1', 'u1');

    const privateCard = screen.getByText('Lectores').closest('[role="button"]')!;
    fireEvent.click(within(privateCard as HTMLElement).getByRole('button', { name: 'Solicitar' }));
    await within(privateCard as HTMLElement).findByRole('button', { name: 'Pendiente' });
    expect(sendGroupJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'g2', fromUid: 'u1', toUid: 'owner' }),
    );
  });

  it('likes and saves community posts, but not videos', async () => {
    renderPage();

    const postCard = (await screen.findByText('Post de la comunidad')).closest(
      'article',
    ) as HTMLElement;
    fireEvent.click(within(postCard).getByRole('button', { name: /^Me gusta/ }));
    fireEvent.click(within(postCard).getByRole('button', { name: 'Guardar publicacion' }));
    expect(appState.toggleLikePost).toHaveBeenCalledWith('p1');
    expect(appState.toggleSavePost).toHaveBeenCalledWith('p1');

    const videoCard = screen.getByText('Video de YouTube').closest('article') as HTMLElement;
    expect(within(videoCard).getByRole('button', { name: /^Me gusta/ })).toBeDisabled();
    expect(within(videoCard).getByRole('button', { name: 'Guardar publicacion' })).toBeDisabled();
  });

  it('follows and saves a category from its trend card', async () => {
    renderPage();
    await screen.findByText('Fisicos');
    // Cards move between the featured and compact slots as signals load, so look it up per click.
    const card = () =>
      screen.getAllByRole('heading', { name: 'Ciencia & Materia' })[0].closest('article')!;

    fireEvent.click(within(card()).getByRole('button', { name: 'Seguir' }));
    expect(appState.toggleFollowCategory).toHaveBeenCalledWith('science');
    expect(showToast).toHaveBeenCalledWith('Categoria seguida', 'success');

    fireEvent.click(within(card()).getByRole('button', { name: 'Guardar' }));
    expect(appState.toggleSaveCategory).toHaveBeenCalledWith('science');
  });

  it('filters the trend categories with the search box', async () => {
    renderPage();
    await screen.findByText('Fisicos');

    fireEvent.change(screen.getByLabelText('Buscar intereses o grupos'), {
      target: { value: 'zzz-sin-resultados' },
    });

    expect(
      await screen.findByText('No hay categorias para mostrar con los filtros actuales.'),
    ).toBeInTheDocument();
  });

  it('loads the next block from both sources when asked', async () => {
    renderPage();
    await screen.findByText('Post de la comunidad');
    await waitFor(() => expect(feedArticles()).toHaveLength(6));

    fireEvent.click(screen.getByRole('button', { name: 'Cargar siguiente bloque' }));

    await waitFor(() => expect(getGlobalFeed).toHaveBeenCalledWith(6, 'cursor-1'));
    expect(fetchYouTubeSearchVideos).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: 'page-2' }),
    );
    await waitFor(() => expect(feedArticles()).toHaveLength(12));
  });

  it('searches YouTube with the typed query after the debounce', async () => {
    renderPage();
    await screen.findByText('Video de YouTube');
    expect(fetchYouTubeSearchVideos).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Buscar videos en YouTube/), {
        target: { value: 'jazz' },
      });
    });

    await waitFor(() =>
      expect(fetchYouTubeSearchVideos).toHaveBeenLastCalledWith({ query: 'jazz', limit: 6 }),
    );
  });
});
