import { z } from 'zod';
import type {
  CollectionItemRead,
  CollectionItemType,
  CollectionRead,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';

export type { CollectionItemRead, CollectionItemType, CollectionRead };

export const uidSchema = idSchema;
export const collectionIdSchema = idSchema;
export const collectionItemIdSchema = idSchema;
export const collectionPageLimitSchema = limitSchema;
export const collectionItemTypeSchema = z.enum(['link', 'note', 'file']);

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
});

export const createCollectionItemInputSchema = z.object({
  collectionName: z.string().trim().min(1).max(120),
  type: collectionItemTypeSchema,
  title: z.string().trim().min(1).max(160),
  url: urlSchema.nullable().optional(),
  text: nullableText(2000),
  fileName: nullableText(255),
  fileSize: z.number().int().min(0).nullable().optional(),
  contentType: nullableText(120),
  storagePath: nullableText(500),
});
