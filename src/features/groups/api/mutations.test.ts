import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  acceptGroupJoinRequest,
  addGroupMember,
  createGroup,
  getOrCreateGroupConversation,
  joinGroupWithSync,
  joinPublicGroup,
  leaveGroupWithSync,
  rejectGroupJoinRequest,
  removeGroupMember,
  sendGroupJoinRequest,
  updateGroup,
  updateGroupMemberRole,
} from '@/features/groups/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  acceptGroupJoinRequest: vi.fn(),
  addGroupMember: vi.fn(),
  createGroup: vi.fn(),
  getOrCreateGroupConversation: vi.fn(),
  joinGroupWithSync: vi.fn(),
  joinPublicGroup: vi.fn(),
  leaveGroupWithSync: vi.fn(),
  rejectGroupJoinRequest: vi.fn(),
  removeGroupMember: vi.fn(),
  sendGroupJoinRequest: vi.fn(),
  updateGroup: vi.fn(),
  updateGroupMemberRole: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('groups api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and trims createGroup input', async () => {
    vi.mocked(firestore.createGroup).mockResolvedValueOnce('group_1');

    await expect(
      createGroup('user_1', {
        name: '  Grupo Elite  ',
        description: '  Descripcion valida  ',
        categoryId: null,
        visibility: 'public',
        iconUrl: null,
      }),
    ).resolves.toBe('group_1');

    expect(firestore.createGroup).toHaveBeenCalledWith('user_1', {
      name: 'Grupo Elite',
      description: 'Descripcion valida',
      categoryId: null,
      visibility: 'public',
      iconUrl: null,
    });
  });

  it('rejects invalid createGroup payload', async () => {
    await expect(
      createGroup('user_1', {
        name: '',
        description: 'desc',
        categoryId: null,
        visibility: 'public',
        iconUrl: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.createGroup).not.toHaveBeenCalled();
  });

  it('forwards update/join/leave/remove operations with validated ids', async () => {
    vi.mocked(firestore.updateGroup).mockResolvedValueOnce();
    vi.mocked(firestore.joinGroupWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.leaveGroupWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.removeGroupMember).mockResolvedValueOnce();

    await expect(
      updateGroup('group_1', {
        name: 'Grupo 1',
        description: 'Descripcion',
        categoryId: 'science',
        visibility: 'private',
        iconUrl: null,
      }),
    ).resolves.toBeUndefined();
    await expect(joinGroupWithSync('group_1', 'user_1')).resolves.toBeUndefined();
    await expect(leaveGroupWithSync('group_1', 'user_1')).resolves.toBeUndefined();
    await expect(removeGroupMember('group_1', 'user_2')).resolves.toBeUndefined();
  });

  it('validates and forwards role updates', async () => {
    vi.mocked(firestore.addGroupMember).mockResolvedValueOnce();
    vi.mocked(firestore.updateGroupMemberRole).mockResolvedValueOnce();

    await expect(addGroupMember('group_1', 'user_2', 'moderator')).resolves.toBeUndefined();
    await expect(updateGroupMemberRole('group_1', 'user_2', 'admin')).resolves.toBeUndefined();
  });

  it('rejects invalid roles before writing', async () => {
    const task = addGroupMember('group_1', 'user_2', 'owner' as 'member');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.addGroupMember).not.toHaveBeenCalled();
  });

  it('retries transient network errors on joinPublicGroup', async () => {
    vi.mocked(firestore.joinPublicGroup)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(joinPublicGroup('group_1', 'user_1')).resolves.toBeUndefined();
    expect(firestore.joinPublicGroup).toHaveBeenCalledTimes(2);
  });

  it('normalizes nullable fields for sendGroupJoinRequest', async () => {
    vi.mocked(firestore.sendGroupJoinRequest).mockResolvedValueOnce('request_1');

    await expect(
      sendGroupJoinRequest({
        groupId: 'group_1',
        groupName: 'Grupo 1',
        fromUid: 'user_1',
        toUid: 'user_2',
        message: '   ',
        fromUserName: '  ',
        fromUserPhoto: null,
      }),
    ).resolves.toBe('request_1');

    expect(firestore.sendGroupJoinRequest).toHaveBeenCalledWith({
      groupId: 'group_1',
      groupName: 'Grupo 1',
      fromUid: 'user_1',
      toUid: 'user_2',
      message: null,
      fromUserName: null,
      fromUserPhoto: null,
    });
  });

  it('keeps trimmed message and user name when they are non-empty', async () => {
    vi.mocked(firestore.sendGroupJoinRequest).mockResolvedValueOnce('request_2');

    await expect(
      sendGroupJoinRequest({
        groupId: 'group_1',
        groupName: 'Grupo 1',
        fromUid: 'user_1',
        toUid: 'user_2',
        message: '  Hola, me gustaria unirme  ',
        fromUserName: '  Vicenzo  ',
        fromUserPhoto: null,
      }),
    ).resolves.toBe('request_2');

    expect(firestore.sendGroupJoinRequest).toHaveBeenCalledWith({
      groupId: 'group_1',
      groupName: 'Grupo 1',
      fromUid: 'user_1',
      toUid: 'user_2',
      message: 'Hola, me gustaria unirme',
      fromUserName: 'Vicenzo',
      fromUserPhoto: null,
    });
  });

  it('forwards accept/reject request and conversation writes', async () => {
    vi.mocked(firestore.acceptGroupJoinRequest).mockResolvedValueOnce();
    vi.mocked(firestore.rejectGroupJoinRequest).mockResolvedValueOnce();
    vi.mocked(firestore.getOrCreateGroupConversation).mockResolvedValueOnce('grp_group_1');

    await expect(acceptGroupJoinRequest('request_1')).resolves.toBeUndefined();
    await expect(rejectGroupJoinRequest('request_1')).resolves.toBeUndefined();
    await expect(getOrCreateGroupConversation('group_1', 'user_1')).resolves.toBe('grp_group_1');
  });
});
