import { z } from 'zod';
import type {
  CollaborationAuthorSnapshot,
  CollaborationLevel,
  CollaborationMode,
  CollaborationRead,
  CollaborationRequestRead,
  CreateCollaborationInput,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';

export type {
  CollaborationAuthorSnapshot,
  CollaborationLevel,
  CollaborationMode,
  CollaborationRequestRead,
  CollaborationRead,
  CreateCollaborationInput,
};

export const uidSchema = idSchema;
export const collaborationIdSchema = idSchema;
export const collaborationRequestIdSchema = idSchema;
export const collaborationPageLimitSchema = limitSchema;
export const collaborationModeSchema = z.enum(['virtual', 'presencial']);
export const collaborationLevelSchema = z.enum(['principiante', 'intermedio', 'experto']);

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const collaborationAuthorSnapshotSchema: z.ZodType<CollaborationAuthorSnapshot> = z.object({
  displayName: z.string().trim().min(1).max(120),
  photoURL: urlSchema.nullable(),
});

export const createCollaborationInputSchema: z.ZodType<CreateCollaborationInput> = z.object({
  title: z.string().trim().min(1).max(120),
  context: z.string().trim().min(1).max(120),
  seekingRole: z.string().trim().min(1).max(80),
  mode: collaborationModeSchema,
  location: nullableText(120),
  level: collaborationLevelSchema,
  topic: nullableText(160),
  tags: z.array(z.string().trim().min(1).max(40)).max(6),
});

export const sendCollaborationRequestInputSchema = z.object({
  collaborationId: collaborationIdSchema,
  collaborationTitle: z.string().trim().min(1).max(120),
  fromUid: uidSchema,
  toUid: uidSchema,
  message: nullableText(1000),
  fromUserName: nullableText(120),
  fromUserPhoto: urlSchema.nullable(),
});
