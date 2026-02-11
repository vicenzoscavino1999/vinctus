import { z } from 'zod';
import type {
  ModerationQueueItemRead,
  ModerationQueueStatus,
  PaginatedResultModel,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema } from '@/shared/lib/validators';

export type { ModerationQueueItemRead, ModerationQueueStatus, PaginatedResultModel };

export const moderationQueueLimitSchema = limitSchema;
export const moderationQueueItemIdSchema = idSchema;

export const moderationQueueStatusSchema = z.enum([
  'pending',
  'in_review',
  'resolved',
  'dismissed',
]);
export const moderationReviewActionSchema = z.string().trim().min(1).max(80);
export const moderationReviewNoteSchema = z.string().trim().max(2000).nullable().optional();
export const uidSchema = idSchema;
