import { z } from 'zod';
import type {
  ConversationMemberRead,
  ConversationRead,
  FirestoreGroup,
  MessageAttachmentRead,
  MessageRead,
  UserProfileRead,
  UserReportReason,
} from '@/shared/lib/firestore';
import { idSchema, validate } from '@/shared/lib/validators';

export type {
  ConversationMemberRead,
  ConversationRead,
  FirestoreGroup,
  MessageAttachmentRead,
  MessageRead,
  UserProfileRead,
  UserReportReason,
};

export const uidSchema = idSchema;
export const groupIdSchema = idSchema;

export const conversationIdSchema = z
  .string()
  .trim()
  .regex(/^(dm|grp)_[A-Za-z0-9_-]+$/);
export const conversationListLimitSchema = z.coerce.number().int().min(1).max(50);
export const membershipLimitSchema = z.coerce.number().int().min(1).max(50);

export const reportReasonSchema = z.enum(['spam', 'harassment', 'abuse', 'fake', 'other']);
export const reportDetailsSchema = z.string().trim().max(2000).nullable().optional();

export const messageAttachmentSchema = z.object({
  kind: z.enum(['image', 'file']),
  url: z.string().trim().url(),
  thumbUrl: z.string().trim().url().nullable().optional(),
  path: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  size: z
    .number()
    .int()
    .min(0)
    .max(25 * 1024 * 1024),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export const sendMessageTextSchema = z.string().max(4000);

export const createUserReportInputSchema = z.object({
  reporterUid: uidSchema,
  reportedUid: uidSchema,
  reason: reportReasonSchema,
  details: reportDetailsSchema,
  conversationId: conversationIdSchema.nullable().optional(),
});

export const createGroupReportInputSchema = z.object({
  reporterUid: uidSchema,
  groupId: groupIdSchema,
  reason: reportReasonSchema,
  details: reportDetailsSchema,
  conversationId: conversationIdSchema.nullable().optional(),
});

const clampLimit = (value: unknown, fallback: number, max: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(numeric)));
};

export const safeConversationListLimit = (value: unknown): number =>
  validate(conversationListLimitSchema, clampLimit(value, 50, 50));

export const safeMembershipLimit = (value: unknown): number =>
  validate(membershipLimitSchema, clampLimit(value, 50, 50));
