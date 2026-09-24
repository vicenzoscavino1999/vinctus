import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { AuthProvider, useAuth } from './AuthContext';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const firebaseUser = {
  uid: 'u1',
  email: 'ana@example.com',
  displayName: 'Ana',
  photoURL: null,
  phoneNumber: null,
  emailVerified: true,
} as unknown as User;

const completeProfile = {
  displayName: 'Ana',
  displayNameLowercase: 'ana',
  photoURL: null,
  email: 'ana@example.com',
  phoneNumber: null,
  settings: {
    privacy: { accountVisibility: 'public' },
    notifications: { pushEnabled: true },
  },
};

const signInWithStoredProfile = (data: Record<string, unknown>) => {
  vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => data } as never);
  vi.mocked(onAuthStateChanged).mockImplementationOnce(((
    _auth: unknown,
    callback: (user: User | null) => void,
  ) => {
    callback(firebaseUser);
    return () => {};
  }) as never);
  renderHook(() => useAuth(), { wrapper });
};

const writesTo = (mock: typeof setDoc | typeof updateDoc, path: string) =>
  vi.mocked(mock).mock.calls.filter(([ref]) => ref === (path as never));

describe('AuthContext ensureUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doc).mockImplementation(((_db: unknown, ...segments: string[]) =>
      segments.join('/')) as never);
  });

  it('backfills missing privacy settings as a nested field path', async () => {
    const { privacy: _privacy, ...settings } = completeProfile.settings;
    signInWithStoredProfile({ ...completeProfile, settings });

    await waitFor(() => expect(updateDoc).toHaveBeenCalled());

    const [[, updates]] = writesTo(updateDoc, 'users/u1');
    expect(updates).toMatchObject({
      'settings.privacy': expect.objectContaining({ accountVisibility: 'public' }),
    });
    // setDoc would store 'settings.privacy' as a literal top-level field name
    for (const [, payload] of writesTo(setDoc, 'users/u1')) {
      expect(payload).not.toHaveProperty(['settings.privacy']);
    }
  });

  it('deletes stray literal dotted fields written by older versions', async () => {
    signInWithStoredProfile({
      ...completeProfile,
      'settings.privacy': { accountVisibility: 'public' },
      'settings.notifications': { pushEnabled: true },
    });

    await waitFor(() => expect(writesTo(setDoc, 'users/u1')).toHaveLength(1));

    expect(writesTo(setDoc, 'users/u1')[0]).toEqual([
      'users/u1',
      { 'settings.privacy': deleteField(), 'settings.notifications': deleteField() },
      { merge: true },
    ]);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('does not write to users/{uid} when the profile is complete', async () => {
    signInWithStoredProfile(completeProfile);

    await waitFor(() => expect(writesTo(setDoc, 'users_public/u1')).toHaveLength(1));

    expect(updateDoc).not.toHaveBeenCalled();
    expect(writesTo(setDoc, 'users/u1')).toHaveLength(0);
  });
});
