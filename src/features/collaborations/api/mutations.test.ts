import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  acceptCollaborationRequest,
  createCollaboration,
  sendCollaborationRequest,
  updateCollaboration,
} from '@/features/collaborations/api/mutations';
import type { CreateCollaborationInput } from '@/features/collaborations/api/types';

vi.mock('@/shared/lib/firestore', () => ({
  acceptCollaborationRequest: vi.fn(),
  createCollaboration: vi.fn(),
  deleteCollaboration: vi.fn(),
  rejectCollaborationRequest: vi.fn(),
  sendCollaborationRequest: vi.fn(),
  updateCollaboration: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const validInput: CreateCollaborationInput = {
  title: 'Proyecto',
  context: 'Proyecto base',
  seekingRole: 'Desarrollador',
  mode: 'virtual',
  location: null,
  level: 'intermedio',
  topic: null,
  tags: ['web', 'react'],
};

describe('collaborations api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and normalizes collaboration creation payload', async () => {
    vi.mocked(firestore.createCollaboration).mockResolvedValueOnce('collab_1');

    await expect(
      createCollaboration(
        'user_1',
        { displayName: '  Ana  ', photoURL: null },
        { ...validInput, title: '  Proyecto  ', tags: [' react ', ' react ', ' ui '] },
      ),
    ).resolves.toBe('collab_1');

    expect(firestore.createCollaboration).toHaveBeenCalledWith(
      'user_1',
      { displayName: 'Ana', photoURL: null },
      { ...validInput, title: 'Proyecto', tags: ['react', 'ui'] },
    );
  });

  it('retries transient collaboration update failures', async () => {
    vi.mocked(firestore.updateCollaboration)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(updateCollaboration('collab_1', validInput)).resolves.toBeUndefined();
    expect(firestore.updateCollaboration).toHaveBeenCalledTimes(2);
  });

  it('validates and normalizes collaboration request payload', async () => {
    vi.mocked(firestore.sendCollaborationRequest).mockResolvedValueOnce('request_1');

    await expect(
      sendCollaborationRequest({
        collaborationId: 'collab_1',
        collaborationTitle: '  Proyecto  ',
        fromUid: 'user_1',
        toUid: 'user_2',
        message: '  ',
        fromUserName: '  Ana  ',
        fromUserPhoto: null,
      }),
    ).resolves.toBe('request_1');

    expect(firestore.sendCollaborationRequest).toHaveBeenCalledWith({
      collaborationId: 'collab_1',
      collaborationTitle: 'Proyecto',
      fromUid: 'user_1',
      toUid: 'user_2',
      message: null,
      fromUserName: 'Ana',
      fromUserPhoto: null,
    });
  });

  it('validates request id before accept mutation', async () => {
    const task = acceptCollaborationRequest('');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.acceptCollaborationRequest).not.toHaveBeenCalled();
  });
});
