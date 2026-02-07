import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase/firestore';
import type { ActivityRead, PaginatedResult } from '@/shared/lib/firestore';
import { idSchema, limitSchema } from '@/shared/lib/validators';

export type { ActivityRead, PaginatedResult };

export type ActivityCursor = DocumentSnapshot | undefined | null;

export const uidSchema = idSchema;
export const activityPageLimitSchema = limitSchema;

export const activityTypeSchema = z.enum(['post_like', 'post_comment', 'follow']);
