import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import SettingsPrivacySecurityPage from './SettingsPrivacySecurityPage';

const mockUser = { uid: 'user_a', email: 'alice@example.com' };
const mockShowToast = vi.fn();
const mockResetPassword = vi.fn();
const mockGetUserSettings = vi.fn();
const mockUpdatePrivacySettings = vi.fn();
const mockGetBlockedUsersProfiles = vi.fn();
const mockUnblockBlockedUser = vi.fn();

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    resetPassword: mockResetPassword,
  }),
}));

vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/shared/lib/firebase', () => ({
  functions: { app: 'test-app' },
}));

vi.mock('@/features/settings/api', () => ({
  DEFAULT_PRIVACY_SETTINGS: {
    accountVisibility: 'public',
    allowDirectMessages: true,
    showOnlineStatus: true,
    showLastActive: true,
    allowFriendRequests: true,
    blockedUsers: [],
  },
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  updatePrivacySettings: (...args: unknown[]) => mockUpdatePrivacySettings(...args),
  getBlockedUsersProfiles: (...args: unknown[]) => mockGetBlockedUsersProfiles(...args),
  unblockBlockedUser: (...args: unknown[]) => mockUnblockBlockedUser(...args),
}));

describe('SettingsPrivacySecurityPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSettings.mockResolvedValue({
      privacy: {
        accountVisibility: 'public',
        allowDirectMessages: true,
        showOnlineStatus: true,
        showLastActive: true,
        allowFriendRequests: true,
        blockedUsers: [],
      },
      notifications: {
        pushEnabled: true,
        emailEnabled: false,
        mentionsOnly: false,
        weeklyDigest: true,
        productUpdates: false,
      },
    });
    mockGetBlockedUsersProfiles.mockResolvedValue([
      { uid: 'user_b', displayName: 'Bob N.', username: 'bob', photoURL: null },
    ]);
    mockUpdatePrivacySettings.mockResolvedValue(undefined);
    mockUnblockBlockedUser.mockResolvedValue(undefined);
  });

  it('shows retry error instead of default toggles when loading privacy settings fails', async () => {
    mockGetUserSettings.mockRejectedValueOnce(new Error('offline'));

    render(
      <MemoryRouter>
        <SettingsPrivacySecurityPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText('No se pudieron cargar tus preferencias de privacidad.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('switch', { name: /Cuenta privada/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Cuenta privada/i })).toBeInTheDocument(),
    );
  });

  it('lists blocked users, unblocks them, and confirms before revoking other sessions', async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirmMock);
    try {
      const revokeCallable = vi.fn().mockResolvedValue({ data: { ok: true } });
      vi.mocked(httpsCallable).mockReturnValue(revokeCallable as never);

      render(
        <MemoryRouter>
          <SettingsPrivacySecurityPage />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByText('Bob N.')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
      await waitFor(() => expect(mockUnblockBlockedUser).toHaveBeenCalledWith('user_a', 'user_b'));
      await waitFor(() =>
        expect(screen.getByText('No has bloqueado a nadie.')).toBeInTheDocument(),
      );

      // Declining confirmation skips revokeUserSessions
      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión en otros dispositivos/i }));
      expect(revokeCallable).not.toHaveBeenCalled();

      // Confirming invokes revokeUserSessions
      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión en otros dispositivos/i }));
      await waitFor(() => expect(revokeCallable).toHaveBeenCalledTimes(1));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
