import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase/firestore';
import type {
  CreateGroupInput,
  FirestoreGroup,
  GroupJoinRequestRead,
  GroupJoinStatus,
  GroupMemberRead,
  GroupVisibility,
  PaginatedResult,
  PostRead,
  UserProfileRead,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';

export type {
  CreateGroupInput,
  FirestoreGroup,
  GroupJoinRequestRead,
  GroupJoinStatus,
  GroupMemberRead,
  GroupVisibility,
  PaginatedResult,
  PostRead,
  UserProfileRead,
};

export type GroupCursor = DocumentSnapshot | undefined | null;

export const uidSchema = idSchema;
export const groupIdSchema = idSchema;
export const requestIdSchema = idSchema;
export const categoryIdSchema = z.string().trim().min(1).max(120);

export const groupVisibilitySchema = z.enum(['public', 'private']);
export const groupRoleSchema = z.enum(['member', 'moderator', 'admin']);
export const groupPageLimitSchema = limitSchema;
export const groupRequestLimitSchema = limitSchema;

export type GroupRole = z.infer<typeof groupRoleSchema>;

export const createGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(600),
  categoryId: categoryIdSchema.nullable(),
  visibility: groupVisibilitySchema,
  iconUrl: urlSchema.nullable(),
});

export const updateGroupInputSchema = createGroupInputSchema;

export const sendGroupJoinRequestInputSchema = z.object({
  groupId: groupIdSchema,
  groupName: z.string().trim().min(1).max(120),
  fromUid: uidSchema,
  toUid: uidSchema,
  message: z.string().trim().max(1000).nullable(),
  fromUserName: z.string().trim().max(120).nullable(),
  fromUserPhoto: urlSchema.nullable(),
});
