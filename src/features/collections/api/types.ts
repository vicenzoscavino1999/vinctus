import { z } from 'zod';
import type {
  CollectionItemRead,
  CollectionItemType,
  CollectionRead,
} from '@/shared/lib/firestore';
import { idSchema, limitSchema, urlSchema } from '@/shared/lib/validators';
import { LIMITS, STORAGE_MAX_BYTES } from '@/shared/lib/firestore/firestoreContract';

export type { CollectionItemRead, CollectionItemType, CollectionRead };

export const uidSchema = idSchema;
export const collectionIdSchema = idSchema;
export const collectionItemIdSchema = idSchema;
export const collectionPageLimitSchema = limitSchema;
export const collectionItemTypeSchema = z.enum(['link', 'note', 'file']);

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const httpUrlSchema = urlSchema.max(LIMITS.collectionItems.urlMaxLength).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'URL must use http or https');

export const createCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.collections.nameMaxLength),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
});

export const updateCollectionInputSchema = createCollectionInputSchema;

export const createCollectionItemInputSchema = z
  .object({
    itemId: idSchema.optional(),
    collectionName: z.string().trim().min(1).max(LIMITS.collectionItems.collectionNameMaxLength),
    type: collectionItemTypeSchema,
    title: z.string().trim().min(1).max(LIMITS.collectionItems.titleMaxLength),
    url: httpUrlSchema.nullable().optional(),
    text: nullableText(LIMITS.collectionItems.noteMaxLength),
    fileName: nullableText(200),
    fileSize: z
      .number()
      .int()
      .min(1)
      .max(STORAGE_MAX_BYTES.file - 1)
      .nullable()
      .optional(),
    contentType: nullableText(120),
    storagePath: nullableText(600),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'link' && !data.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Link URL required' });
    }
    if (data.type === 'note' && (!data.text || data.text.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Note text required' });
    }
    if (data.type === 'file') {
      if (!data.url) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'File URL required' });
      }
      if (!data.fileName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fileName'],
          message: 'File name required',
        });
      }
      if (typeof data.fileSize !== 'number') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fileSize'],
          message: 'File size required',
        });
      }
      if (!data.contentType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contentType'],
          message: 'Content type required',
        });
      }
      if (!data.storagePath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['storagePath'],
          message: 'Storage path required',
        });
      }
    }
  });
