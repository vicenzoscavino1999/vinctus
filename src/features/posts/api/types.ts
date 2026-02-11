import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase/firestore';
import type { CreatePostUploadingInput } from '@/shared/lib/firestore-post-upload';
import type { CreateStoryInput, StoryMediaType, StoryRead } from '@/shared/lib/firestore/stories';
import type { PostCommentRead } from '@/shared/lib/firestore/postEngagement';
import type { PostRead } from '@/shared/lib/firestore/posts';
import type { PaginatedResult } from '@/shared/lib/firestore/sharedTypes';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';

export type {
  CreatePostUploadingInput,
  CreateStoryInput,
  PaginatedResult,
  PostCommentRead,
  PostRead,
  StoryMediaType,
  StoryRead,
};

export type PostCursor = DocumentSnapshot | undefined | null;

export const postIdSchema = idSchema;
export const storyIdSchema = idSchema;
export const userIdSchema = idSchema;
export const paginationLimitSchema = limitSchema;
export const reportReasonSchema = z.enum(['spam', 'harassment', 'abuse', 'fake', 'other']);
export type UserReportReason = z.infer<typeof reportReasonSchema>;
export const reportDetailsSchema = z.string().trim().max(2000).nullable().optional();

export const authorSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  photoURL: urlSchema.nullable(),
});

export const commentTextSchema = z.string().trim().min(1).max(2000);

export const OWNER_IDS_READ_CHUNK_SIZE = 200;
export const ownerIdsSchema = z.array(idSchema).min(1).max(OWNER_IDS_READ_CHUNK_SIZE);

export const createStoryInputSchema = z.object({
  storyId: idSchema.optional(),
  ownerId: idSchema,
  ownerName: z.string().trim().min(1).max(120).nullable(),
  ownerPhoto: urlSchema.nullable(),
  mediaType: z.enum(['image', 'video']),
  mediaUrl: urlSchema,
  mediaPath: z.string().trim().min(1).max(500),
  thumbUrl: urlSchema.nullable().optional(),
  thumbPath: z.string().trim().min(1).max(500).nullable().optional(),
  visibility: z.literal('friends').optional(),
});

export const createPostUploadingInputSchema = z.object({
  postId: idSchema,
  authorId: idSchema,
  authorSnapshot: authorSnapshotSchema,
  title: z.string().trim().max(160).nullable().optional(),
  text: z.string().trim().min(1).max(5000),
  groupId: idSchema.nullable().optional(),
  categoryId: z.string().trim().min(1).max(120).nullable().optional(),
});

export const updatePostPatchSchema = z
  .record(z.string(), z.unknown())
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Patch cannot be empty' });

export const createPostReportInputSchema = z.object({
  reporterUid: userIdSchema,
  postId: postIdSchema,
  postAuthorId: userIdSchema.nullable().optional(),
  reason: reportReasonSchema,
  details: reportDetailsSchema,
});

export const createPostCommentReportInputSchema = z.object({
  reporterUid: userIdSchema,
  postId: postIdSchema,
  commentId: idSchema,
  commentAuthorId: userIdSchema.nullable().optional(),
  reason: reportReasonSchema,
  details: reportDetailsSchema,
});
