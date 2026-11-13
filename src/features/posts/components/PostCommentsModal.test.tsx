import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostCommentsModal from './PostCommentsModal';
import { getPostComments } from '@/features/posts/api';
import type { PostSummary } from '@/features/posts/model/postSummary';

vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'ana', displayName: 'Ana', photoURL: null } }),
}));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('./ContentReportModal', () => ({ default: () => null }));
vi.mock('@/features/posts/api', () => ({
  getPostComments: vi.fn(),
  getNewPostId: vi.fn(),
  addPostComment: vi.fn(),
  createPostReport: vi.fn(),
  createPostCommentReport: vi.fn(),
}));
const post = (postId: string): PostSummary => ({
  postId,
  authorId: 'bruno',
  authorName: 'Bruno',
  authorPhoto: null,
  title: postId,
  text: 'Texto',
  imageUrl: null,
  likeCount: 3,
  commentCount: 20,
  media: [],
  createdAt: null,
});
const empty = { items: [], lastDoc: null, hasMore: false };

describe('comments modal identity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPostComments).mockResolvedValue(empty);
  });

  it('keeps the editor when the parent updates counters on the same post', async () => {
    const first = post('p1');
    const props = { isOpen: true, post: first, onClose: vi.fn(), onCommentAdded: vi.fn() };
    const view = render(<PostCommentsModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Agregar comentario/ }));
    fireEvent.change(screen.getByPlaceholderText('Escribe tu comentario...'), {
      target: { value: 'Mi borrador' },
    });
    view.rerender(<PostCommentsModal {...props} post={{ ...first, commentCount: 21 }} />);
    expect(screen.getByPlaceholderText('Escribe tu comentario...')).toHaveValue('Mi borrador');
    await waitFor(() => expect(getPostComments).toHaveBeenCalledTimes(1));
  });

  it('ignores an old post load after moving to another post', async () => {
    let complete!: (page: Awaited<ReturnType<typeof getPostComments>>) => void;
    vi.mocked(getPostComments).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const props = { isOpen: true, post: post('p1'), onClose: vi.fn(), onCommentAdded: vi.fn() };
    const view = render(<PostCommentsModal {...props} />);
    view.rerender(<PostCommentsModal {...props} post={post('p2')} />);
    await waitFor(() => expect(screen.getByText('No hay comentarios aun.')).toBeVisible());
    await act(async () => {
      complete({
        ...empty,
        items: [
          {
            id: 'c1',
            postId: 'p1',
            authorId: 'ana',
            authorSnapshot: { displayName: 'Ana', photoURL: null },
            text: 'Comentario del post anterior',
            createdAt: new Date(),
          },
        ],
      });
    });
    expect(screen.queryByText('Comentario del post anterior')).not.toBeInTheDocument();
    expect(screen.getByText('No hay comentarios aun.')).toBeVisible();
  });
});
