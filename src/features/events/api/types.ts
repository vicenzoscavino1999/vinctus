import { z } from 'zod';
import type { CreateEventInput, EventVisibility, FirestoreEvent } from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';

export type { CreateEventInput, EventVisibility, FirestoreEvent };

export const uidSchema = idSchema;
export const eventIdSchema = idSchema;
export const eventPageLimitSchema = limitSchema;
export const eventVisibilitySchema = z.enum(['public', 'private']);

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const createEventInputSchema: z.ZodType<CreateEventInput> = z.object({
  title: z.string().trim().min(1).max(120),
  description: nullableText(2000),
  startAt: z.date(),
  endAt: z.date().nullable().optional(),
  city: nullableText(120),
  venue: nullableText(160),
  capacity: z.number().int().min(0).max(100000).nullable(),
  visibility: eventVisibilitySchema,
  coverUrl: urlSchema.nullable().optional(),
});
