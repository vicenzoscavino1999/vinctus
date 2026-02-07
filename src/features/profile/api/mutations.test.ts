import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  acceptFollowRequest,
  createContribution,
  getOrCreateDirectConversation,
  saveCategoryWithSync,
  sendFollowRequest,
  updateContributionFile,
  updateUserProfile,
} from '@/features/profile/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  acceptFollowRequest: vi.fn(),
  cancelFollowRequest: vi.fn(),
  createContribution: vi.fn(),
  declineFollowRequest: vi.fn(),
  followPublicUser: vi.fn(),
  getOrCreateDirectConversation: vi.fn(),
  saveCategoryWithSync: vi.fn(),
  sendFollowRequest: vi.fn(),
  unfollowUser: vi.fn(),
  unsaveCategoryWithSync: vi.fn(),
  updateContributionFile: vi.fn(),
  updateUserProfile: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('profile api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and forwards follow request mutation', async () => {
    vi.mocked(firestore.sendFollowRequest).mockResolvedValueOnce('req_1');

    await expect(sendFollowRequest('user_1', 'user_2')).resolves.toBe('req_1');
    expect(firestore.sendFollowRequest).toHaveBeenCalledWith('user_1', 'user_2');
  });

  it('normalizes profile updates before write', async () => {
    vi.mocked(firestore.updateUserProfile).mockResolvedValueOnce();

    await expect(
      updateUserProfile('user_1', {
        displayName: '  Ana  ',
        bio: '   ',
        role: '  Dev  ',
      }),
    ).resolves.toBeUndefined();

    expect(firestore.updateUserProfile).toHaveBeenCalledWith('user_1', {
      displayName: 'Ana',
      bio: undefined,
      role: 'Dev',
      location: undefined,
      photoURL: undefined,
      username: undefined,
    });
  });

  it('validates and normalizes contribution creation', async () => {
    vi.mocked(firestore.createContribution).mockResolvedValueOnce('contrib_1');

    await expect(
      createContribution({
        userId: 'user_1',
        type: 'project',
        title: '  Portfolio  ',
        description: '   ',
        link: null,
        categoryId: '  science  ',
      }),
    ).resolves.toBe('contrib_1');

    expect(firestore.createContribution).toHaveBeenCalledWith({
      userId: 'user_1',
      type: 'project',
      title: 'Portfolio',
      description: null,
      link: null,
      categoryId: 'science',
    });
  });

  it('retries transient update contribution file failures', async () => {
    vi.mocked(firestore.updateContributionFile)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(
      updateContributionFile('contrib_1', {
        fileUrl: 'https://cdn.example.com/file.pdf',
        filePath: '/files/file.pdf',
        fileName: 'file.pdf',
        fileSize: 1200,
        fileType: 'application/pdf',
      }),
    ).resolves.toBeUndefined();

    expect(firestore.updateContributionFile).toHaveBeenCalledTimes(2);
  });

  it('validates ids before protected writes', async () => {
    const saveTask = saveCategoryWithSync('', 'user_1');
    const acceptTask = acceptFollowRequest('', 'user_1');
    const conversationTask = getOrCreateDirectConversation('user_1', '');

    await expect(saveTask).rejects.toBeInstanceOf(AppError);
    await expect(acceptTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(conversationTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
