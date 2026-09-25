import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sendChatMessage } from '@/shared/lib/aiChat';
import AIChatPage from './AIChatPage';

vi.mock('@/shared/lib/aiChat', () => ({ sendChatMessage: vi.fn() }));
vi.mock('@/shared/lib/aiConsent', () => ({
  getAIConsent: () => ({ granted: true }),
  setAIConsent: vi.fn(),
}));
vi.mock('@/features/settings/api/aiConsent', () => ({
  getServerAIConsent: vi.fn(async () => ({ recorded: true, granted: true })),
  updateServerAIConsent: vi.fn(),
}));
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/shared/lib/voice', () => ({
  useVoice: () => ({
    isListening: false,
    isSpeaking: false,
    isSupported: false,
    interimText: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
    error: null,
  }),
}));

const sendMessage = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/Escribe un mensaje/i), {
    target: { value: text },
  });
  fireEvent.submit(screen.getByPlaceholderText(/Escribe un mensaje/i).closest('form')!);
};

describe('AIChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('links to the group the assistant just created', async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      response: 'Listo. Cree el grupo "IA para amigos" (public).',
      history: [],
      action: { type: 'createGroup', groupId: 'group_1' },
    });
    render(<AIChatPage />, { wrapper: MemoryRouter });

    sendMessage('crea el grupo IA para amigos');

    const link = await screen.findByRole('link', { name: 'Ver grupo' });
    expect(link).toHaveAttribute('href', '/group/group_1');
  });

  it('shows no group link for a plain reply', async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({ response: 'Hola', history: [] });
    render(<AIChatPage />, { wrapper: MemoryRouter });

    sendMessage('hola');

    expect(await screen.findByText('Hola')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver grupo' })).not.toBeInTheDocument();
  });
});
