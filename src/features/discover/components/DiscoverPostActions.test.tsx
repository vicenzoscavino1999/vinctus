import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import DiscoverPostActions from './DiscoverPostActions';
import {
  isPostLiked,
  isPostSaved,
  likePostWithSync,
  unlikePostWithSync,
  savePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api';

const auth = vi.hoisted(() => ({ uid: 'ana' as string | null, toast: vi.fn() }));
vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: auth.uid ? { uid: auth.uid } : null }),
}));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: auth.toast }) }));
vi.mock('@/features/posts/api', () => ({
  isPostLiked: vi.fn(),
  isPostSaved: vi.fn(),
  likePostWithSync: vi.fn(),
  unlikePostWithSync: vi.fn(),
  savePostWithSync: vi.fn(),
  unsavePostWithSync: vi.fn(),
}));

const props = () => ({
  postId: 'post-after-50',
  initialCount: 4,
  commentCount: 2,
  onComments: vi.fn(),
  onLikeCount: vi.fn(),
});
beforeEach(() => {
  vi.resetAllMocks();
  auth.uid = 'ana';
  vi.mocked(isPostLiked).mockResolvedValue(false);
  vi.mocked(isPostSaved).mockResolvedValue(false);
});

it('reads the visible post directly without a global-list provider and does not add an existing like twice', async () => {
  vi.mocked(isPostLiked).mockResolvedValue(true);
  vi.mocked(isPostSaved).mockResolvedValue(true);
  const callbacks = props();
  render(<DiscoverPostActions {...callbacks} />);
  const liked = await screen.findByRole('button', { name: 'Quitar me gusta' });
  expect(liked).toHaveAttribute('aria-pressed', 'true');
  expect(liked).toHaveTextContent(/^4$/);
  expect(screen.getByRole('button', { name: 'Quitar de guardados' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(isPostLiked).toHaveBeenCalledWith('post-after-50', 'ana');
  expect(isPostSaved).toHaveBeenCalledWith('post-after-50', 'ana');
  fireEvent.click(screen.getByRole('button', { name: 'Comentarios: 2' }));
  expect(callbacks.onComments).toHaveBeenCalledTimes(1);
});

it('keeps a failed initial lookup unknown and retries the read before allowing a write', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(isPostLiked).mockReturnValueOnce(
    new Promise((_yes, no) => {
      reject = no;
    }),
  );
  render(<DiscoverPostActions {...props()} />);
  expect(screen.getByRole('button', { name: 'Consultando me gusta' })).toBeDisabled();
  await act(async () => reject(new Error('offline')));
  vi.mocked(isPostLiked).mockResolvedValueOnce(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar consulta de me gusta' }));
  expect(await screen.findByRole('button', { name: 'Quitar me gusta' })).toHaveTextContent(/^4$/);
  expect(likePostWithSync).not.toHaveBeenCalled();
  expect(unlikePostWithSync).not.toHaveBeenCalled();
});

it('retries a lost like acknowledgement with the same choice, blocks double clicks and changes the total once', async () => {
  vi.mocked(likePostWithSync).mockRejectedValueOnce(new Error('lost response'));
  render(<DiscoverPostActions {...props()} initialCount={0} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Me gusta' }));
  const retry = await screen.findByRole('button', { name: 'Reintentar me gusta' });
  expect(retry).toHaveTextContent(/^0$/);
  let finish!: () => void;
  vi.mocked(likePostWithSync).mockReturnValueOnce(
    new Promise((yes) => {
      finish = yes;
    }),
  );
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(likePostWithSync).toHaveBeenCalledTimes(2);
  await act(async () => finish());
  const liked = await screen.findByRole('button', { name: 'Quitar me gusta' });
  expect(liked).toHaveTextContent(/^1$/);
  expect(liked).toHaveAttribute('aria-pressed', 'true');
  expect(unlikePostWithSync).not.toHaveBeenCalled();
});

it('keeps the intended save after a failed confirmation', async () => {
  vi.mocked(savePostWithSync)
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce();
  render(<DiscoverPostActions {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar publicación' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar guardar' }));
  expect(await screen.findByRole('button', { name: 'Quitar de guardados' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(savePostWithSync).toHaveBeenCalledTimes(2);
  expect(unsavePostWithSync).not.toHaveBeenCalled();
});

it('ignores a late failure from the previous account and post', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(likePostWithSync).mockReturnValueOnce(
    new Promise((_yes, no) => {
      reject = no;
    }),
  );
  const callbacks = props();
  const { rerender } = render(<DiscoverPostActions {...callbacks} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Me gusta' }));
  auth.uid = 'bruno';
  rerender(<DiscoverPostActions {...callbacks} postId="new-post" initialCount={7} />);
  await screen.findByRole('button', { name: 'Me gusta' });
  callbacks.onLikeCount.mockClear();
  await act(async () => reject(new Error('old account')));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Me gusta' })).toHaveTextContent(/^7$/);
  expect(callbacks.onLikeCount).not.toHaveBeenCalledWith('post-after-50', expect.anything());
  expect(isPostLiked).toHaveBeenCalledWith('new-post', 'bruno');
});

it('does not store a guest preference or write without login', async () => {
  auth.uid = null;
  render(<DiscoverPostActions {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Me gusta' }));
  expect(auth.toast).toHaveBeenCalledWith('Inicia sesión para continuar', 'info');
  expect(isPostLiked).not.toHaveBeenCalled();
  expect(likePostWithSync).not.toHaveBeenCalled();
});
