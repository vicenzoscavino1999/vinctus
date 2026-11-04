import { z } from 'zod';
import type { DocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import type {
  AccountVisibility,
  ContributionRead,
  ContributionType,
  FollowRequestRead,
  FollowStatus,
  FollowUserRead,
  PaginatedResult,
  PublicUserRead,
  UserProfileRead,
  UserProfileUpdate,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

export type {
  AccountVisibility,
  ContributionRead,
  ContributionType,
  FollowRequestRead,
  FollowStatus,
  FollowUserRead,
  PaginatedResult,
  PublicUserRead,
  UserProfileRead,
  UserProfileUpdate,
};

export type FollowListType = 'followers' | 'following';
export type FollowCursor = DocumentSnapshot | undefined | null;
export type FollowRequestWithUser = FollowRequestRead & { fromUser: FollowUserRead | null };
export type UserProfileSubscription = Unsubscribe;

export const uidSchema = idSchema;
export const categoryIdSchema = z.string().trim().min(1).max(120);
export const profileSearchQuerySchema = z.string().trim().min(1).max(120);
export const followListTypeSchema = z.enum(['followers', 'following']);
export const accountVisibilitySchema = z.enum(['public', 'private']);
export const profilePageLimitSchema = limitSchema;
export const recentUsersLimitSchema = limitSchema;
export const contributionTypeSchema = z.enum(['project', 'paper', 'cv', 'certificate', 'other']);

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

export const userProfileUpdateSchema: z.ZodType<UserProfileUpdate> = z.object({
  displayName: optionalTrimmedString(LIMITS.profile.displayNameMaxLength),
  photoURL: urlSchema.nullable().optional(),
  bio: optionalTrimmedString(LIMITS.profile.bioMaxLength),
  role: optionalTrimmedString(LIMITS.profile.roleMaxLength),
  location: optionalTrimmedString(LIMITS.profile.locationMaxLength),
  username: optionalTrimmedString(40),
});

export const createContributionInputSchema = z.object({
  userId: uidSchema,
  type: contributionTypeSchema,
  title: z.string().trim().min(1).max(LIMITS.contributions.titleMaxLength),
  description: z
    .string()
    .trim()
    .max(LIMITS.contributions.descriptionMaxLength)
    .nullable()
    .optional(),
  link: urlSchema.nullable().optional(),
  categoryId: categoryIdSchema.nullable().optional(),
});

export const updateContributionFileInputSchema = z.object({
  fileUrl: urlSchema,
  filePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(0),
  fileType: z.string().trim().min(1).max(120),
});
