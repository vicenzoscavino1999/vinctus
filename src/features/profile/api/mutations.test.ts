import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  acceptFollowRequest,
  blockUser,
  createContribution,
  deleteContribution,
  followCategoryWithSync,
  getOrCreateDirectConversation,
  saveCategoryWithSync,
  sendFollowRequest,
  unblockUser,
  unfollowCategoryWithSync,
  updateContributionFile,
  updateUserProfile,
} from '@/features/profile/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  acceptFollowRequest: vi.fn(),
  blockUser: vi.fn(),
  cancelFollowRequest: vi.fn(),
  createContribution: vi.fn(),
  declineFollowRequest: vi.fn(),
  deleteContribution: vi.fn(),
  followCategoryWithSync: vi.fn(),
  followPublicUser: vi.fn(),
  getOrCreateDirectConversation: vi.fn(),
  saveCategoryWithSync: vi.fn(),
  sendFollowRequest: vi.fn(),
  unblockUser: vi.fn(),
  unfollowCategoryWithSync: vi.fn(),
  unfollowUser: vi.fn(),
  unsaveCategoryWithSync: vi.fn(),
  updateContributionFile: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock('@/shared/lib/storage', () => ({
  deleteCollectionFile: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');
const storage = await import('@/shared/lib/storage');

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
      bio: null,
      role: 'Dev',
      location: undefined,
      photoURL: undefined,
      username: undefined,
    });
  });

  it('deletes contribution storage attachment before removing the document', async () => {
    vi.mocked(storage.deleteCollectionFile).mockResolvedValueOnce();
    vi.mocked(firestore.deleteContribution).mockResolvedValueOnce();

    await expect(
      deleteContribution('contrib_1', 'contributions/user_1/contrib_1/doc.pdf'),
    ).resolves.toBeUndefined();
    expect(storage.deleteCollectionFile).toHaveBeenCalledWith(
      'contributions/user_1/contrib_1/doc.pdf',
    );
    expect(firestore.deleteContribution).toHaveBeenCalledWith('contrib_1');
  });

  it('deletes contribution document even when storage attachment is already missing', async () => {
    vi.mocked(storage.deleteCollectionFile).mockRejectedValueOnce({
      code: 'storage/object-not-found',
    });
    vi.mocked(firestore.deleteContribution).mockResolvedValueOnce();

    await expect(
      deleteContribution('contrib_2', 'contributions/user_1/contrib_2/missing.pdf'),
    ).resolves.toBeUndefined();
    expect(firestore.deleteContribution).toHaveBeenCalledWith('contrib_2');
  });

  it('validates block and unblock user ids', async () => {
    vi.mocked(firestore.blockUser).mockResolvedValueOnce();
    vi.mocked(firestore.unblockUser).mockResolvedValueOnce();

    await expect(blockUser('user_1', 'user_2')).resolves.toBeUndefined();
    await expect(unblockUser('user_1', 'user_2')).resolves.toBeUndefined();
    expect(firestore.blockUser).toHaveBeenCalledWith('user_1', 'user_2');
    expect(firestore.unblockUser).toHaveBeenCalledWith('user_1', 'user_2');
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
    const followTask = followCategoryWithSync('', 'user_1');
    const unfollowTask = unfollowCategoryWithSync('', 'user_1');

    await expect(saveTask).rejects.toBeInstanceOf(AppError);
    await expect(acceptTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(conversationTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(followTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(unfollowTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
