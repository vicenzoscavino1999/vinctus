import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  blockUser,
  clearConversationMute,
  createGroupReport,
  createUserReport,
  getOrCreateGroupConversation,
  leaveGroupWithSync,
  markConversationRead,
  sendMessage,
  setConversationMute,
  unblockUser,
} from '@/features/chat/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  blockUser: vi.fn(),
  clearConversationMute: vi.fn(),
  createGroupReport: vi.fn(),
  createUserReport: vi.fn(),
  getOrCreateGroupConversation: vi.fn(),
  leaveGroupWithSync: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessage: vi.fn(),
  setConversationMute: vi.fn(),
  unblockUser: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('chat api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient network errors on blockUser', async () => {
    vi.mocked(firestore.blockUser)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(blockUser('user_1', 'user_2')).resolves.toBeUndefined();
    expect(firestore.blockUser).toHaveBeenCalledTimes(2);
  });

  it('forwards unblock and mute writes with validated input', async () => {
    vi.mocked(firestore.unblockUser).mockResolvedValueOnce();
    vi.mocked(firestore.clearConversationMute).mockResolvedValueOnce();
    vi.mocked(firestore.setConversationMute).mockResolvedValueOnce();

    await expect(unblockUser('user_1', 'user_2')).resolves.toBeUndefined();
    await expect(clearConversationMute('grp_group_1', 'user_1')).resolves.toBeUndefined();
    await expect(setConversationMute('grp_group_1', 'user_1', null)).resolves.toBeUndefined();
  });

  it('rejects invalid mutedUntil date', async () => {
    await expect(
      setConversationMute('grp_group_1', 'user_1', new Date('invalid')),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('creates reports with validated payloads', async () => {
    vi.mocked(firestore.createUserReport).mockResolvedValueOnce('report_1');
    vi.mocked(firestore.createGroupReport).mockResolvedValueOnce('report_2');

    await expect(
      createUserReport({
        reporterUid: 'user_1',
        reportedUid: 'user_2',
        reason: 'spam',
        details: 'details',
        conversationId: 'dm_user_1_user_2',
      }),
    ).resolves.toBe('report_1');

    await expect(
      createGroupReport({
        reporterUid: 'user_1',
        groupId: 'group_1',
        reason: 'abuse',
        details: null,
      }),
    ).resolves.toBe('report_2');
  });

  it('rejects invalid report payload', async () => {
    await expect(
      createUserReport({
        reporterUid: '',
        reportedUid: 'user_2',
        reason: 'spam',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.createUserReport).not.toHaveBeenCalled();
  });

  it('sends message with attachments when text is empty', async () => {
    vi.mocked(firestore.sendMessage).mockResolvedValueOnce();

    await expect(
      sendMessage('dm_user_1_user_2', 'user_1', '', 'Alice', null, [
        {
          kind: 'image',
          url: 'https://cdn.example.com/pic.jpg',
          path: 'messages/dm_user_1_user_2/pic.jpg',
          fileName: 'pic.jpg',
          contentType: 'image/jpeg',
          size: 1024,
          thumbUrl: null,
          width: 100,
          height: 80,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects empty message when there are no attachments', async () => {
    const task = sendMessage('dm_user_1_user_2', 'user_1', '   ');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards group conversation writes', async () => {
    vi.mocked(firestore.getOrCreateGroupConversation).mockResolvedValueOnce('grp_group_1');
    vi.mocked(firestore.leaveGroupWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.markConversationRead).mockResolvedValueOnce();

    await expect(getOrCreateGroupConversation('group_1', 'user_1')).resolves.toBe('grp_group_1');
    await expect(leaveGroupWithSync('group_1', 'user_1')).resolves.toBeUndefined();
    await expect(markConversationRead('grp_group_1', 'user_1')).resolves.toBeUndefined();
  });
});
