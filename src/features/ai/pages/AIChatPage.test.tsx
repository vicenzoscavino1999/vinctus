import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sendChatMessage } from '@/shared/lib/aiChat';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import AIChatPage from './AIChatPage';

let mockAuthUser: { uid: string } | null = { uid: 'u1' };
const localConsentByUid = new Map<string, boolean>();

vi.mock('@/shared/lib/aiChat', () => ({ sendChatMessage: vi.fn() }));
vi.mock('@/shared/lib/aiConsent', () => ({
  getAIConsent: (uid?: string | null) => ({
    granted: uid ? (localConsentByUid.get(uid) ?? false) : false,
    updatedAt: null,
  }),
  setAIConsent: vi.fn((granted: boolean, uid?: string | null) => {
    if (uid) localConsentByUid.set(uid, granted);
    return { granted, updatedAt: new Date().toISOString() };
  }),
}));
vi.mock('@/features/settings/api/aiConsent', () => ({
  getServerAIConsent: vi.fn(async () => ({
    recorded: true,
    granted: true,
    source: 'ai_chat',
    updatedAt: null,
  })),
  updateServerAIConsent: vi.fn(async () => undefined),
}));
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: mockAuthUser }) }));
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
    mockAuthUser = { uid: 'u1' };
    localConsentByUid.clear();
    localConsentByUid.set('u1', true);
    vi.mocked(getServerAIConsent).mockResolvedValue({
      recorded: true,
      granted: true,
      source: 'ai_chat',
      updatedAt: null,
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('links to the group the assistant just created', async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      response: 'Listo. Cree el grupo "IA para amigos" (public).',
      history: [],
      action: { type: 'createGroup', groupId: 'group_1' },
    });
    render(<AIChatPage />, { wrapper: MemoryRouter });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).not.toBeDisabled(),
    );
    sendMessage('crea el grupo IA para amigos');

    const link = await screen.findByRole('link', { name: 'Ver grupo' });
    expect(link).toHaveAttribute('href', '/group/group_1');
  });

  it('shows no group link for a plain reply and resets conversation on button click', async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      response: 'Hola de vuelta',
      history: [
        { role: 'user', parts: [{ text: 'hola' }] },
        { role: 'model', parts: [{ text: 'Hola de vuelta' }] },
      ],
    });
    render(<AIChatPage />, { wrapper: MemoryRouter });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).not.toBeDisabled(),
    );
    sendMessage('hola');

    expect(await screen.findByText('Hola de vuelta')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver grupo' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nueva conversación/i }));
    expect(screen.queryByText('Hola de vuelta')).not.toBeInTheDocument();
  });

  it('requires explicit consent when unrecorded and resets chat when switching accounts', async () => {
    localConsentByUid.clear();
    vi.mocked(getServerAIConsent).mockResolvedValue({
      recorded: false,
      granted: false,
      source: null,
      updatedAt: null,
    });

    const { rerender } = render(<AIChatPage />, { wrapper: MemoryRouter });

    const acceptBtn = await screen.findByRole('button', { name: 'Aceptar y continuar' });
    expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).toBeDisabled();

    fireEvent.click(acceptBtn);
    await waitFor(() => {
      expect(updateServerAIConsent).toHaveBeenCalledWith('u1', true, 'ai_chat');
      expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).not.toBeDisabled();
    });

    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      response: 'Mensaje privado de u1',
      history: [],
    });
    sendMessage('secreto u1');
    expect(await screen.findByText('Mensaje privado de u1')).toBeInTheDocument();

    // Switching to u2 must NOT carry over u1's chat messages or local consent.
    mockAuthUser = { uid: 'u2' };
    rerender(<AIChatPage />);

    expect(screen.queryByText('Mensaje privado de u1')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Aceptar y continuar' })).toBeInTheDocument();
  });

  it('rejects empty 0-byte images when OpenAI mode is enabled', async () => {
    render(<AIChatPage />, { wrapper: MemoryRouter });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Usar OpenAI/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const emptyPng = new File([], 'empty.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [emptyPng] } });

    expect(
      await screen.findByText('Elige una imagen PNG, JPEG o WebP válida de hasta 2 MB.'),
    ).toBeInTheDocument();
  });
});
