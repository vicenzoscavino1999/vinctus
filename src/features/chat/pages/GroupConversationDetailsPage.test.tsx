import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupConversationDetailsPage from '@/features/chat/pages/GroupConversationDetailsPage';

const chatApi = vi.hoisted(() => ({
  getGroup: vi.fn(),
  leaveGroupWithSync: vi.fn(),
  createGroupReport: vi.fn(),
  getConversationMember: vi.fn(),
  setConversationMute: vi.fn(),
  clearConversationMute: vi.fn(),
  subscribeToMessages: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/features/chat/api', () => chatApi);
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: toast }) }));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

const renderPage = (id = 'grp_g1') =>
  render(
    <MemoryRouter initialEntries={[`/messages/${id}/group-details`]}>
      <Routes>
        <Route
          path="/messages/:conversationId/group-details"
          element={<GroupConversationDetailsPage />}
        />
        <Route path="*" element={<p>Otra página</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );

const location = () => screen.getByTestId('location').textContent;

describe('GroupConversationDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatApi.getGroup.mockResolvedValue({
      id: 'g1',
      name: 'Jazz y café',
      ownerId: 'owner',
      memberCount: 12,
      iconUrl: null,
    });
    chatApi.getConversationMember.mockResolvedValue({ uid: 'me', muted: false, mutedUntil: null });
    chatApi.leaveGroupWithSync.mockResolvedValue(undefined);
    chatApi.createGroupReport.mockResolvedValue('r1');
    chatApi.subscribeToMessages.mockImplementation(() => () => undefined);
  });

  it('shows the group, and leaves it after confirming', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jazz y café' })).toBeInTheDocument();
    expect(screen.getByText('Grupo · 12 miembros')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar grupo/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salir del grupo' }));
    const sheet = screen.getByRole('dialog', { name: 'Salir del grupo' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salir' }));

    await waitFor(() => expect(chatApi.leaveGroupWithSync).toHaveBeenCalledWith('g1', 'me'));
    expect(location()).toBe('/messages');
  });

  it('lets the owner edit but not leave', async () => {
    chatApi.getGroup.mockResolvedValue({ id: 'g1', name: 'Jazz y café', ownerId: 'me' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Editar grupo/ }));
    expect(location()).toBe('/group/g1/edit');
  });

  it('hides Salir for the owner', async () => {
    chatApi.getGroup.mockResolvedValue({ id: 'g1', name: 'Jazz y café', ownerId: 'me' });
    renderPage();
    await screen.findByRole('heading', { name: 'Jazz y café' });
    expect(screen.queryByRole('button', { name: 'Salir del grupo' })).not.toBeInTheDocument();
    expect(screen.getByText(/Eres el propietario/)).toBeInTheDocument();
  });

  it('reports the group', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar grupo' }));
    const sheet = screen.getByRole('dialog', { name: 'Reportar grupo' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(chatApi.createGroupReport).toHaveBeenCalledWith({
        reporterUid: 'me',
        groupId: 'g1',
        reason: 'spam',
        details: null,
        conversationId: 'grp_g1',
      }),
    );
  });

  it('copies the group link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Compartir enlace' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/group/g1`),
    );
    expect(toast).toHaveBeenCalledWith('Enlace copiado', 'success');
  });

  it('opens the group page', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver grupo' }));
    expect(location()).toBe('/group/g1');
  });

  it('goes back to the chat', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Jazz y café' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al chat' }));
    expect(location()).toBe('/messages?conversation=grp_g1');
  });

  it('shows an error when the group cannot load', async () => {
    chatApi.getGroup.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText('No se pudo cargar el grupo.')).toBeInTheDocument();
  });

  it('sends a direct conversation to the inbox', async () => {
    renderPage('dm_ana_me');
    await waitFor(() => expect(location()).toBe('/messages'));
  });
});
