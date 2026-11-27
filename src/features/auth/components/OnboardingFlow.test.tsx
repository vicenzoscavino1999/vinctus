import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from '@/shared/constants';
import OnboardingFlow from './OnboardingFlow';

const api = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  followCategoryWithSync: vi.fn(),
  getGroups: vi.fn(),
  joinPublicGroup: vi.fn(),
}));

vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/features/profile/api', () => ({
  getUserProfile: api.getUserProfile,
  followCategoryWithSync: api.followCategoryWithSync,
}));
vi.mock('@/features/groups/api', () => ({
  getGroups: api.getGroups,
  joinPublicGroup: api.joinPublicGroup,
}));

const [first, second] = CATEGORIES;

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getUserProfile.mockResolvedValue({ createdAt: new Date(), postsCount: 0 });
    api.followCategoryWithSync.mockResolvedValue(undefined);
    api.joinPublicGroup.mockResolvedValue(undefined);
    api.getGroups.mockResolvedValue([
      {
        id: 'g_other',
        name: 'Otro tema',
        categoryId: 'zzz',
        memberCount: 900,
        visibility: 'public',
      },
      {
        id: 'g_match',
        name: 'Del interés',
        categoryId: second.id,
        memberCount: 5,
        visibility: 'public',
      },
      {
        id: 'g_private',
        name: 'Privado',
        categoryId: second.id,
        memberCount: 50,
        visibility: 'private',
      },
    ]);
  });

  it('lets an account that already existed straight in', async () => {
    api.getUserProfile.mockResolvedValue({
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      postsCount: 0,
    });
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('vinctus_onboarding_complete')).toBe('true');
    expect(screen.queryByText(/Bienvenido a/)).not.toBeInTheDocument();
  });

  it('follows the chosen interests and joins the chosen real groups', async () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);

    expect(await screen.findByText(/Bienvenido a/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    const next = screen.getByRole('button', { name: /Continuar/ });
    fireEvent.click(screen.getByRole('button', { name: first.label }));
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: second.label }));
    expect(next).not.toBeDisabled();
    fireEvent.click(next);

    // Real public groups, the chosen interest's first; private ones are not offered.
    const rows = await screen.findAllByRole('button', { pressed: false });
    const names = rows.map((row) => row.textContent ?? '');
    expect(names[0]).toContain('Del interés');
    expect(names.some((name) => name.includes('Otro tema'))).toBe(true);
    expect(screen.queryByText('Privado')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Del interés/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Unirme y empezar' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(api.followCategoryWithSync).toHaveBeenCalledWith(first.id, 'u1');
    expect(api.followCategoryWithSync).toHaveBeenCalledWith(second.id, 'u1');
    expect(api.joinPublicGroup).toHaveBeenCalledWith('g_match', 'u1');
    expect(api.joinPublicGroup).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('vinctus_interests') ?? '[]')).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('can start without groups, and a failed join does not block the welcome', async () => {
    api.joinPublicGroup.mockRejectedValue(new Error('offline'));
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);

    fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    fireEvent.click(screen.getByRole('button', { name: first.label }));
    fireEvent.click(screen.getByRole('button', { name: second.label }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    await screen.findByText('Otro tema');

    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(api.joinPublicGroup).not.toHaveBeenCalled();
  });
});
