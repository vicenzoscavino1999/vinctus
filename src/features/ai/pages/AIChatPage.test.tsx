import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/shared/ui/Toast';
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
const reportAIResponse = vi.hoisted(() => vi.fn(async () => 'r1'));
vi.mock('@/features/ai/api', () => ({ reportAIResponse }));
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

const Wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>
    <MemoryRouter>{children}</MemoryRouter>
  </ToastProvider>
);

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
    render(<AIChatPage />, { wrapper: Wrapper });

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
    render(<AIChatPage />, { wrapper: Wrapper });

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

    const { rerender } = render(<AIChatPage />, { wrapper: Wrapper });

    const acceptBtn = await screen.findByRole('button', { name: 'Aceptar y continuar' });
    // Nothing can be written until the person accepts.
    expect(screen.queryByPlaceholderText(/Escribe un mensaje/i)).not.toBeInTheDocument();

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

  it('reports an AI reply to moderation with its text', async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      response: 'Una respuesta fuera de lugar',
      history: [],
      provider: 'gemini',
    });
    render(<AIChatPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).not.toBeDisabled(),
    );
    sendMessage('hola');
    expect(await screen.findByText('Una respuesta fuera de lugar')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reportar respuesta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(reportAIResponse).toHaveBeenCalledWith({
        reporterUid: 'u1',
        contextId: 'chat',
        excerpt: 'Una respuesta fuera de lugar',
        reason: 'spam',
        details: null,
      }),
    );
  });

  it('starts empty with suggestions that fill the field', async () => {
    render(<AIChatPage />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Crea un grupo sobre astronomía' }));
    expect(screen.getByPlaceholderText(/Escribe un mensaje/i)).toHaveValue(
      'Crea un grupo sobre astronomía',
    );
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('rejects empty 0-byte images when OpenAI mode is enabled', async () => {
    render(<AIChatPage />, { wrapper: Wrapper });

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
