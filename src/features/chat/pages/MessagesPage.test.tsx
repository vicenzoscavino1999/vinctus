import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationRead, FirestoreGroup } from '@/features/chat/api';
import MessagesPage from '@/features/chat/pages/MessagesPage';

const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);

const data = vi.hoisted(() => ({
  conversations: [] as ConversationRead[],
  groups: {} as Record<string, FirestoreGroup>,
  memberships: [] as string[],
  blocked: [] as string[],
}));

const chatApi = vi.hoisted(() => ({
  subscribeToConversations: vi.fn(),
  subscribeToUserMemberships: vi.fn(),
  getGroup: vi.fn(),
  getUserProfile: vi.fn(),
  getBlockedUsers: vi.fn(),
  getOrCreateGroupConversation: vi.fn(),
  // Used by the outbox, which the page creates.
  sendMessage: vi.fn(),
  uploadMessageAttachment: vi.fn(),
}));

vi.mock('@/features/chat/api', () => chatApi);
vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'me', displayName: 'Yo', photoURL: null } }),
}));
vi.mock('@/shared/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/features/groups/components/CreateGroupModal', () => ({ default: () => null }));
vi.mock('@/features/chat/components/ConversationScreen', () => ({
  default: ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div>
      <p>Chat con {title}</p>
      <button type="button" onClick={onBack}>
        Volver
      </button>
    </div>
  ),
}));

const message = (text: string, senderId: string, minutesAgo: number, senderName?: string) => ({
  text,
  senderId,
  senderName: senderName ?? null,
  createdAt: at(minutesAgo),
  clientCreatedAt: now - minutesAgo * 60_000,
});

const renderPage = (path = '/messages') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MessagesPage />
    </MemoryRouter>,
  );

describe('MessagesPage inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    data.conversations = [
      {
        id: 'dm_ana_me',
        type: 'direct',
        memberIds: ['ana', 'me'],
        lastMessage: message('¿Vienes el sábado?', 'ana', 5),
        createdAt: at(60),
        updatedAt: at(5),
      },
      {
        id: 'grp_fisica',
        type: 'group',
        groupId: 'fisica',
        lastMessage: message('Lo comparto mañana', 'carla', 30, 'Carla Rojas'),
        createdAt: at(600),
        updatedAt: at(30),
      },
      {
        id: 'dm_me_troll',
        type: 'direct',
        memberIds: ['me', 'troll'],
        lastMessage: message('spam', 'troll', 40),
        createdAt: at(600),
        updatedAt: at(40),
      },
      {
        id: 'dm_bob_me',
        type: 'direct',
        memberIds: ['bob', 'me'],
        lastMessage: message('Listo', 'me', 90),
        createdAt: at(600),
        updatedAt: at(90),
      },
    ];
    data.groups = {
      fisica: { id: 'fisica', name: 'Física Cuántica', memberCount: 12, iconUrl: null },
      jazz: { id: 'jazz', name: 'Jazz en Lima', memberCount: 1, description: 'Jam los viernes' },
    };
    data.memberships = ['fisica', 'jazz'];
    data.blocked = ['troll'];

    chatApi.subscribeToConversations.mockImplementation(
      (_uid: string, callback: (convs: ConversationRead[]) => void) => {
        callback(data.conversations);
        return () => undefined;
      },
    );
    chatApi.subscribeToUserMemberships.mockImplementation(
      (_uid: string, onUpdate: (ids: string[]) => void) => {
        onUpdate(data.memberships);
        return () => undefined;
      },
    );
    chatApi.getGroup.mockImplementation(async (id: string) => data.groups[id] ?? null);
    chatApi.getUserProfile.mockImplementation(async (uid: string) => ({
      displayName: { ana: 'Ana Torres', bob: 'Bob Núñez', troll: 'Troll' }[uid] ?? 'Usuario',
      photoURL: null,
    }));
    chatApi.getBlockedUsers.mockImplementation(async () => data.blocked);
    chatApi.getOrCreateGroupConversation.mockImplementation(async (id: string) => `grp_${id}`);
  });

  it('lists every conversation newest first, with who wrote last, and hides blocked people', async () => {
    renderPage();

    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(await screen.findByText('Física Cuántica')).toBeInTheDocument();
    expect(await screen.findByText('Bob Núñez')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('spam')).not.toBeInTheDocument());

    const rows = within(screen.getByRole('list')).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('¿Vienes el sábado?'),
      expect.stringContaining('Carla: Lo comparto mañana'),
      expect.stringContaining('Tú: Listo'),
    ]);
  });

  it('filters by kind and searches without accents', async () => {
    renderPage();
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Grupos' }));
    expect(screen.queryByText('Ana Torres')).not.toBeInTheDocument();
    expect(screen.getAllByText('Física Cuántica').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Privados' }));
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.queryByText('Física Cuántica')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.change(screen.getByLabelText('Buscar conversaciones'), {
      target: { value: 'nunez' },
    });
    expect(screen.getByText('Bob Núñez')).toBeInTheDocument();
    expect(screen.queryByText('Ana Torres')).not.toBeInTheDocument();
  });

  it('shows your groups under Grupos and opens a group chat from there', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Grupos' }));

    const yourGroups = await screen.findByRole('region', { name: 'Tus grupos' });
    expect(within(yourGroups).getByText('Jazz en Lima')).toBeInTheDocument();
    expect(within(yourGroups).getByText('1 miembro · Jam los viernes')).toBeInTheDocument();

    fireEvent.click(within(yourGroups).getAllByRole('button', { name: 'Abrir chat' })[1]);
    expect(await screen.findByText('Chat con Jazz en Lima')).toBeInTheDocument();
    expect(chatApi.getOrCreateGroupConversation).toHaveBeenCalledWith('jazz', 'me');
  });

  it('opens a conversation from the list and goes back to it', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Ana Torres'));

    expect(await screen.findByText('Chat con Ana Torres')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('heading', { name: 'Mensajes' })).toBeInTheDocument();
  });

  it('opens a conversation from a link, even one not in the list yet', async () => {
    renderPage('/messages?conversation=dm_me_zoe');
    chatApi.getUserProfile.mockResolvedValue({ displayName: 'Zoe', photoURL: null });

    expect(await screen.findByText(/Chat con/)).toBeInTheDocument();
    await waitFor(() => expect(chatApi.getUserProfile).toHaveBeenCalledWith('zoe'));
  });
});
