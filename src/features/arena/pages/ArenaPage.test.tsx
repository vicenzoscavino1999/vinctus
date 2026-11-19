import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/shared/ui/Toast';
import type { Debate, Turn } from '@/features/arena/types';
import ArenaPage from './ArenaPage';

const mockCreateDebate = vi.fn();
const mockLikeDebate = vi.fn();
const mockUnlikeDebate = vi.fn();
const mockSaveDebate = vi.fn();
const mockUnsaveDebate = vi.fn();
const mockGetArenaUsage = vi.fn();
const mockIsLiked = vi.fn();
const mockIsSaved = vi.fn();
const mockSubscribeToDebate = vi.fn();
const mockSubscribeToTurns = vi.fn();
const mockGetServerAIConsent = vi.fn();
const mockUpdateServerAIConsent = vi.fn();

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/shared/lib/aiConsent', () => ({
  getAIConsent: () => ({ granted: false, updatedAt: null }),
  setAIConsent: vi.fn(),
}));
vi.mock('@/features/settings/api/aiConsent', () => ({
  getServerAIConsent: (...args: unknown[]) => mockGetServerAIConsent(...args),
  updateServerAIConsent: (...args: unknown[]) => mockUpdateServerAIConsent(...args),
}));
vi.mock('@/features/arena/api/mutations', () => ({
  createDebate: (...args: unknown[]) => mockCreateDebate(...args),
  likeArenaDebateWithSync: (...args: unknown[]) => mockLikeDebate(...args),
  unlikeArenaDebateWithSync: (...args: unknown[]) => mockUnlikeDebate(...args),
  saveArenaDebateWithSync: (...args: unknown[]) => mockSaveDebate(...args),
  unsaveArenaDebateWithSync: (...args: unknown[]) => mockUnsaveDebate(...args),
}));
vi.mock('@/features/arena/api/queries', () => ({
  getArenaUsage: (...args: unknown[]) => mockGetArenaUsage(...args),
  isArenaDebateLiked: (...args: unknown[]) => mockIsLiked(...args),
  isArenaDebateSaved: (...args: unknown[]) => mockIsSaved(...args),
  subscribeToDebate: (...args: unknown[]) => mockSubscribeToDebate(...args),
  subscribeToTurns: (...args: unknown[]) => mockSubscribeToTurns(...args),
}));
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({ id: 'arenaDebates' })),
    doc: vi.fn(() => ({ id: 'generated_debate_id' })),
    getDoc: vi.fn(async () => ({ exists: () => false })),
  };
});

const renderArena = (initialRoute = '/arena') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/arena/:debateId" element={<ArenaPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerAIConsent.mockResolvedValue({
      recorded: true,
      granted: true,
      source: 'arena',
      updatedAt: null,
    });
    mockUpdateServerAIConsent.mockResolvedValue(undefined);
    mockGetArenaUsage.mockResolvedValue({ used: 1, limit: 10, remaining: 9 });
    mockIsLiked.mockResolvedValue(false);
    mockIsSaved.mockResolvedValue(false);
    mockLikeDebate.mockResolvedValue(undefined);
    mockUnlikeDebate.mockResolvedValue(undefined);
    mockSaveDebate.mockResolvedValue(undefined);
    mockUnsaveDebate.mockResolvedValue(undefined);
    mockSubscribeToDebate.mockImplementation(() => vi.fn());
    mockSubscribeToTurns.mockImplementation(() => vi.fn());
  });

  it('shows not-found message instead of infinite loading for missing or private debates', async () => {
    mockSubscribeToDebate.mockImplementation((_id: string, cb: (d: Debate | null) => void) => {
      cb(null);
      return vi.fn();
    });
    mockSubscribeToTurns.mockImplementation((_id: string, cb: (t: Turn[]) => void) => {
      cb([]);
      return vi.fn();
    });

    renderArena('/arena/private_missing_id');

    expect(
      await screen.findByText('Este debate no existe o no tienes acceso para verlo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a Arena' })).toBeInTheDocument();
  });

  it('creates a private debate when visibility is switched to Privado', async () => {
    mockCreateDebate.mockResolvedValueOnce({
      success: true,
      debateId: 'generated_debate_id',
      summary: 'Resumen',
      verdict: { winner: 'A', reason: 'Mejor evidencia' },
      remaining: 8,
    });

    renderArena('/arena');

    await waitFor(() => expect(screen.getByText('1/10')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Tema del debate'), {
      target: { value: 'Energía nuclear vs solar en 2030' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /El Cientifico/i })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /El Esceptico/i })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Privado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar debate' }));

    await waitFor(() => {
      expect(mockCreateDebate).toHaveBeenCalledWith({
        topic: 'Energía nuclear vs solar en 2030',
        personaA: 'scientist',
        personaB: 'skeptic',
        visibility: 'private',
        clientDebateId: 'generated_debate_id',
      });
    });
  });

  it('renders safe source links, toggles like/save, and rolls back on failure', async () => {
    const sampleDebate = {
      id: 'debate_1',
      createdBy: 'u1',
      topic: 'Tema de ciencia',
      mode: 'debate',
      personaA: 'scientist',
      personaB: 'philosopher',
      status: 'done',
      visibility: 'public',
      language: 'es',
      summary: 'Resumen final.',
      verdict: { winner: 'draw', reason: 'Empate técnico.' },
      sourceLinks: ['https://arxiv.org/abs/2401.00001', 'javascript:alert(1)'],
      likesCount: 2,
    } as Debate;

    mockSubscribeToDebate.mockImplementation((_id: string, cb: (d: Debate | null) => void) => {
      cb(sampleDebate);
      return vi.fn();
    });
    mockSubscribeToTurns.mockImplementation((_id: string, cb: (t: Turn[]) => void) => {
      cb([{ id: 't0', idx: 0, speaker: 'A', text: 'Primer argumento.' } as Turn]);
      return vi.fn();
    });
    mockLikeDebate.mockRejectedValueOnce(new Error('offline'));

    renderArena('/arena/debate_1');

    expect(await screen.findByText('Tema de ciencia')).toBeInTheDocument();
    const safeLink = screen.getByRole('link', { name: 'https://arxiv.org/abs/2401.00001' });
    expect(safeLink).toHaveAttribute('href', 'https://arxiv.org/abs/2401.00001');
    expect(screen.queryByText('javascript:alert(1)')).not.toBeInTheDocument();

    const likeBtn = screen.getByRole('button', { name: 'Dar me gusta' });
    fireEvent.click(likeBtn);
    await waitFor(() => expect(mockLikeDebate).toHaveBeenCalledWith('debate_1', 'u1'));
    expect(likeBtn).toHaveAttribute('aria-pressed', 'false');

    const saveBtn = screen.getByRole('button', { name: /Guardar/i });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(mockSaveDebate).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Guardado/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});
