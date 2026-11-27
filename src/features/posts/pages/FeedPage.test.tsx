import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedPage from '@/features/posts/pages/FeedPage';
import { clearSessionResources } from '@/shared/hooks/useSessionResource';

const api = vi.hoisted(() => ({
  getGlobalFeed: vi.fn(),
  getBlockedUsers: vi.fn(),
  getPost: vi.fn(),
  getPostComments: vi.fn(),
  addPostComment: vi.fn(),
  getNewPostId: vi.fn(),
  createPostReport: vi.fn(),
  createPostCommentReport: vi.fn(),
}));

vi.mock('@/features/posts/api', () => api);
vi.mock('@/features/groups/api', () => ({ getGroup: vi.fn(async () => null) }));
vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'me', displayName: 'Yo', photoURL: null } }),
}));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/features/posts/components/StoriesWidget', () => ({ default: () => null }));
vi.mock('@/features/posts/hooks/usePostEngagement', () => ({
  usePostEngagement: () => ({
    like: { value: false, count: 0, loaded: true, loading: false, error: null },
    save: { value: false, count: 0, loaded: true, loading: false, error: null },
    act: vi.fn(),
  }),
}));

const post = (postId: string, authorId: string, text: string) => ({
  id: postId,
  postId,
  authorId,
  authorSnapshot: { displayName: authorId === 'troll' ? 'Troll' : 'Ana', photoURL: null },
  title: null,
  text,
  media: [],
  likeCount: 0,
  commentCount: 2,
  createdAt: new Date(),
  status: 'ready',
  groupId: null,
});

const renderFeed = (path = '/feed') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FeedPage />
    </MemoryRouter>,
  );

describe('FeedPage', () => {
  let resolveBlocked: (ids: string[]) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionResources();
    api.getGlobalFeed.mockResolvedValue({
      items: [post('p1', 'ana', 'Primera publicación'), post('p2', 'troll', 'Spam bloqueado')],
      lastDoc: null,
      hasMore: false,
    });
    api.getBlockedUsers.mockReturnValue(
      new Promise((resolve) => {
        resolveBlocked = resolve;
      }),
    );
    api.getPostComments.mockResolvedValue({ items: [], lastDoc: null, hasMore: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for the blocked list so a blocked post never shows', async () => {
    renderFeed();

    expect(screen.getByRole('status', { name: 'Cargando publicaciones' })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Spam bloqueado')).not.toBeInTheDocument();

    await act(async () => {
      resolveBlocked(['troll']);
    });
    expect(await screen.findByText('Primera publicación')).toBeInTheDocument();
    expect(screen.queryByText('Spam bloqueado')).not.toBeInTheDocument();
  });

  it('opens the comments sheet of a post from the link', async () => {
    renderFeed('/feed?post=p1');
    await act(async () => {
      resolveBlocked([]);
    });

    const sheet = await screen.findByRole('dialog', { name: 'Comentarios de la publicación' });
    expect(within(sheet).getByRole('heading', { name: 'Comentarios (2)' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Ver publicación' })).toHaveAttribute(
      'href',
      '/post/p1',
    );
  });

  it('copies the link of the post page', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderFeed();
    await act(async () => {
      resolveBlocked([]);
    });

    const card = (await screen.findByText('Primera publicación')).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Copiar enlace' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/post/p1`);
  });
});
