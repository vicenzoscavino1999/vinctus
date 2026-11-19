import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModerationQueuePage from './ModerationQueuePage';

const mockUser = { uid: 'admin_1' };
const mockShowToast = vi.fn();
const mockIsCurrentUserAppAdmin = vi.fn();
const mockGetModerationQueue = vi.fn();
const mockUpdateStatus = vi.fn();
const mockApplyAction = vi.fn();

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/features/moderation/api', () => ({
  isCurrentUserAppAdmin: (...args: unknown[]) => mockIsCurrentUserAppAdmin(...args),
  getModerationQueue: (...args: unknown[]) => mockGetModerationQueue(...args),
  updateModerationQueueStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  applyModerationAction: (...args: unknown[]) => mockApplyAction(...args),
}));

describe('ModerationQueuePage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCurrentUserAppAdmin.mockResolvedValue(true);
    mockUpdateStatus.mockResolvedValue(undefined);
    mockApplyAction.mockResolvedValue({ status: 'resolved', reviewAction: 'post_removed' });
    mockGetModerationQueue.mockResolvedValue({
      items: [
        {
          id: 'item_auto',
          reportId: 'item_auto',
          reportPath: 'reports/item_auto',
          reporterUid: 'system_moderation',
          reportedUid: 'admin_1',
          reason: 'other',
          details: 'Auto moderation removed content',
          conversationId: 'post_p1',
          source: 'auto_moderation',
          targetType: 'post',
          priority: 'high',
          status: 'pending',
          reviewAction: null,
          reviewNote: 'Nota existente del turno anterior',
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date('2026-11-19T12:00:00Z'),
          updatedAt: new Date('2026-11-19T12:00:00Z'),
        },
        {
          id: 'item_resolved',
          reportId: 'item_resolved',
          reportPath: 'reports/item_resolved',
          reporterUid: 'user_a',
          reportedUid: 'user_b',
          reason: 'spam',
          details: 'Spam resuelto',
          conversationId: null,
          source: 'user_report',
          targetType: 'user',
          priority: 'medium',
          status: 'resolved',
          reviewAction: 'no_violation',
          reviewNote: null,
          reviewedBy: 'admin_1',
          reviewedAt: new Date('2026-11-19T12:00:00Z'),
          createdAt: new Date('2026-11-19T11:00:00Z'),
          updatedAt: new Date('2026-11-19T12:00:00Z'),
        },
      ],
      lastDoc: null,
      hasMore: false,
    });
  });

  it('preserves existing reviewNote, shows Auto-moderación badge, hides self-suspend, and filters by status', async () => {
    render(<ModerationQueuePage />);

    await waitFor(() => expect(screen.getByText('Auto-moderación')).toBeInTheDocument());

    // Self-suspend must be hidden for item_auto (reportedUid === admin_1), visible for item_resolved (user_b)
    expect(screen.getAllByRole('button', { name: 'Suspender usuario' })).toHaveLength(1);

    // Filter to Pendientes -> only item_auto remains
    fireEvent.click(screen.getByRole('tab', { name: 'Pendientes' }));
    expect(screen.queryByText('Spam resuelto')).not.toBeInTheDocument();
    expect(screen.getByText('Auto moderation removed content')).toBeInTheDocument();

    // Clicking Resolver without editing textarea must preserve existing item.reviewNote!
    fireEvent.click(screen.getByRole('button', { name: 'Resolver' }));
    await waitFor(() =>
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item_auto',
          status: 'resolved',
          reviewNote: 'Nota existente del turno anterior',
        }),
      ),
    );
  });
});
