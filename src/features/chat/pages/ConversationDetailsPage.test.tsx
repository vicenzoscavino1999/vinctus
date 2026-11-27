import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRead } from '@/features/chat/api';
import ConversationDetailsPage from '@/features/chat/pages/ConversationDetailsPage';

const chatApi = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  isUserBlocked: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  createUserReport: vi.fn(),
  getConversationMember: vi.fn(),
  setConversationMute: vi.fn(),
  clearConversationMute: vi.fn(),
  subscribeToMessages: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/features/chat/api', () => chatApi);
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('@/features/groups/components/CreateGroupModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <p>Nuevo grupo con Ana</p> : null),
}));

const message = (id: string, text: string, extra: Partial<MessageRead> = {}): MessageRead =>
  ({
    id,
    text,
    senderId: 'ana',
    senderName: 'Ana',
    createdAt: new Date(2026, 10, 20, 18, 30),
    clientCreatedAt: 1,
    clientId: id,
    ...extra,
  }) as MessageRead;

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

const renderPage = (id = 'dm_ana_me') =>
  render(
    <MemoryRouter initialEntries={[`/messages/${id}/details`]}>
      <Routes>
        <Route path="/messages/:conversationId/details" element={<ConversationDetailsPage />} />
        <Route path="*" element={<p>Otra página</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );

const location = () => screen.getByTestId('location').textContent;

describe('ConversationDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    chatApi.getUserProfile.mockResolvedValue({
      uid: 'ana',
      displayName: 'Ana',
      username: 'ana.r',
      photoURL: null,
    });
    chatApi.isUserBlocked.mockResolvedValue(false);
    chatApi.getConversationMember.mockResolvedValue({ uid: 'me', muted: false, mutedUntil: null });
    chatApi.setConversationMute.mockResolvedValue(undefined);
    chatApi.clearConversationMute.mockResolvedValue(undefined);
    chatApi.blockUser.mockResolvedValue(undefined);
    chatApi.createUserReport.mockResolvedValue('r1');
    chatApi.subscribeToMessages.mockImplementation(
      (_id: string, callback: (messages: MessageRead[]) => void) => {
        callback([
          message('m2', 'Nos vemos el sábado en el observatorio'),
          message('m1', '', {
            attachments: [
              {
                kind: 'image',
                url: 'https://example.com/foto.jpg',
                path: 'chat/foto.jpg',
                fileName: 'foto.jpg',
                contentType: 'image/jpeg',
                size: 2048,
              },
            ],
          }),
        ]);
        return () => undefined;
      },
    );
  });

  it('shows the person with the shortcuts, and goes back to the chat', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByText('@ana.r')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fotos y archivos/ })).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Volver al chat' }));
    expect(location()).toBe('/messages?conversation=dm_ana_me');
  });

  it('opens the profile', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver perfil' }));
    expect(location()).toBe('/user/ana');
  });

  it('mutes for an hour and unmutes', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Silenciar' }));
    const sheet = screen.getByRole('dialog', { name: 'Silenciar conversación' });
    fireEvent.click(within(sheet).getByRole('button', { name: '1 hora' }));

    await waitFor(() => expect(chatApi.setConversationMute).toHaveBeenCalledTimes(1));
    const [conversationId, uid, until] = chatApi.setConversationMute.mock.calls[0];
    expect([conversationId, uid]).toEqual(['dm_ana_me', 'me']);
    expect((until as Date).getTime() - Date.now()).toBeGreaterThan(3_500_000);
    expect(await screen.findByText(/^Silenciado hasta/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar silencio' }));
    await waitFor(() =>
      expect(chatApi.clearConversationMute).toHaveBeenCalledWith('dm_ana_me', 'me'),
    );
    expect(await screen.findByRole('button', { name: 'Silenciar' })).toBeInTheDocument();
  });

  it('finds a message ignoring accents and jumps to it in the chat', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar en la conversación' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar mensajes' }), {
      target: { value: 'sabado' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Nos vemos el sábado/ }));
    expect(window.sessionStorage.getItem('vinctus:jumpMessageId')).toBe('m2');
    expect(location()).toBe('/messages?conversation=dm_ana_me');
  });

  it('lists the shared photos', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Fotos y archivos/ }));
    const sheet = screen.getByRole('dialog', { name: 'Fotos y archivos' });
    expect(within(sheet).getByRole('link', { name: 'Abrir foto.jpg' })).toHaveAttribute(
      'href',
      'https://example.com/foto.jpg',
    );
  });

  it('blocks after confirming and returns to the inbox', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Bloquear a Ana' }));
    const sheet = screen.getByRole('dialog', { name: 'Bloquear a Ana' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(location()).toBe('/messages'));
    expect(chatApi.blockUser).toHaveBeenCalledWith('me', 'ana');
  });

  it('reports with a reason and details', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar a Ana' }));
    const sheet = screen.getByRole('dialog', { name: 'Reportar usuario' });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Acoso' }));
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Detalles (opcional)' }), {
      target: { value: 'Mensajes ofensivos' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(chatApi.createUserReport).toHaveBeenCalledWith({
        reporterUid: 'me',
        reportedUid: 'ana',
        reason: 'harassment',
        details: 'Mensajes ofensivos',
        conversationId: 'dm_ana_me',
      }),
    );
    expect(toast).toHaveBeenCalledWith('Reporte enviado', 'success');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the report open with an error when it fails', async () => {
    chatApi.createUserReport.mockRejectedValue(new Error('offline'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar a Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar el reporte.');
    expect(screen.getByRole('dialog', { name: 'Reportar usuario' })).toBeInTheDocument();
  });

  it('clears the chat on this device after confirming', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Limpiar chat local/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    const stored = JSON.parse(window.localStorage.getItem('vinctus:clearedConversations') ?? '{}');
    expect(stored.dm_ana_me).toEqual(expect.any(Number));
  });

  it('opens Crear grupo with this person', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Crear grupo con esta persona' }));
    expect(screen.getByText('Nuevo grupo con Ana')).toBeInTheDocument();
  });

  it('sends a group conversation to the inbox', async () => {
    renderPage('grp_g1');
    await waitFor(() => expect(location()).toBe('/messages'));
  });
});
