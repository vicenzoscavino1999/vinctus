import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
const appState = vi.hoisted(() => ({
  followedCategories: ['science'] as string[],
  toggleFollowCategory: vi.fn(),
}));
const profileApi = vi.hoisted(() => ({ subscribeToUserProfile: vi.fn() }));
const arenaQueries = vi.hoisted(() => ({ getSavedArenaDebates: vi.fn() }));
const arenaMutations = vi.hoisted(() => ({ unsaveArenaDebateWithSync: vi.fn() }));

vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'me', displayName: 'Ana', email: 'ana@vinctus.test' } }),
}));
vi.mock('@/context/app-state', () => ({ useAppState: () => appState }));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/features/profile/api', () => profileApi);
vi.mock('@/features/arena/api/queries', () => arenaQueries);
vi.mock('@/features/arena/api/mutations', () => arenaMutations);
vi.mock('@/features/posts/components/StoriesWidget', () => ({
  default: () => <div>Historias</div>,
}));
vi.mock('@/features/posts/components/ProfilePostsGrid', () => ({
  default: () => <section aria-label="Mis publicaciones" />,
}));
vi.mock('@/features/posts/components/SavedPostsPanel', () => ({
  default: () => <section aria-label="Publicaciones guardadas" />,
}));
vi.mock('@/features/profile/components/ContributionsSection', () => ({
  default: () => <section aria-label="Portafolio" />,
}));
vi.mock('@/features/collections/components/CollectionsPanel', () => ({
  default: () => <section aria-label="Mis colecciones" />,
}));
vi.mock('@/features/profile/components/EditProfileModal', () => ({
  default: () => <div role="dialog" aria-label="Editar perfil" />,
}));

const { default: ProfilePage } = await import('./ProfilePage');

const profile = {
  uid: 'me',
  displayName: 'Ana Torres',
  email: 'ana@vinctus.test',
  photoURL: null,
  role: 'Astrónoma',
  location: '',
  bio: '',
  reputation: 140,
  karmaByInterest: { science: 12 },
  postsCount: 12345,
  followersCount: 3,
  followingCount: 1,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/:uid/connections" element={<p>Lista de conexiones</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileApi.subscribeToUserProfile.mockImplementation((_uid, onData) => {
      onData(profile);
      return () => undefined;
    });
    arenaQueries.getSavedArenaDebates.mockResolvedValue([
      {
        debateId: 'd1',
        topic: '¿La IA tendrá derechos?',
        personaA: 'philosopher',
        personaB: 'scientist',
        summary: 'Un debate sobre conciencia.',
        verdictWinner: 'A',
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
    ]);
    arenaMutations.unsaveArenaDebateWithSync.mockResolvedValue(undefined);
  });

  it('shows the header with prompts for missing details and the counters', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ana Torres' })).toBeInTheDocument();
    expect(screen.getByText('Astrónoma')).toBeInTheDocument();
    expect(screen.queryByText('Sin ubicación')).not.toBeInTheDocument();
    expect(screen.getByText('12.345')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Añadir biografía' }));
    expect(screen.getByRole('dialog', { name: 'Editar perfil' })).toBeInTheDocument();
  });

  it('puts your posts in "Mi Perfil" and keeps reputation, categories and contact', async () => {
    renderPage();

    expect(await screen.findByRole('region', { name: 'Mis publicaciones' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Portafolio' })).toBeInTheDocument();
    // Saved items moved to their own tab.
    expect(
      screen.queryByRole('region', { name: 'Publicaciones guardadas' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('ana@vinctus.test')).toBeInTheDocument();
    expect(screen.getByText('Ciencia & Materia · 12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dejar de seguir Ciencia & Materia' }));
    expect(appState.toggleFollowCategory).toHaveBeenCalledWith('science');
    expect(toast.showToast).toHaveBeenCalledWith('Categoría dejada de seguir', 'info');
  });

  it('opens the follower lists from the counters', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Seguidores/ }));
    expect(await screen.findByText('Lista de conexiones')).toBeInTheDocument();
  });

  it('keeps saved posts and debates under "Guardados", and removes a debate', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Guardados/ }));

    expect(screen.getByRole('region', { name: 'Publicaciones guardadas' })).toBeInTheDocument();
    const debates = screen.getByRole('region', { name: 'Debates guardados' });
    expect(await within(debates).findByText('¿La IA tendrá derechos?')).toBeInTheDocument();

    fireEvent.click(within(debates).getByRole('button', { name: /Quitar/ }));
    await waitFor(() => {
      expect(within(debates).queryByText('¿La IA tendrá derechos?')).not.toBeInTheDocument();
    });
    expect(arenaMutations.unsaveArenaDebateWithSync).toHaveBeenCalledWith('d1', 'me');

    fireEvent.click(screen.getByRole('tab', { name: /Colecciones/ }));
    expect(screen.getByRole('region', { name: 'Mis colecciones' })).toBeInTheDocument();
  });
});
