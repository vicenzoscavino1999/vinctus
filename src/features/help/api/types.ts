import { z } from 'zod';
import type { SupportTicketContext, SupportTicketType } from '@/shared/lib/firestore';
import { emailSchema, idSchema, urlSchema } from '@/shared/lib/validators';

export type { SupportTicketContext, SupportTicketType };

export const supportTicketTypeSchema = z.enum(['issue', 'feature']);

export const supportTicketContextSchema: z.ZodType<SupportTicketContext> = z.object({
  path: z.string().trim().min(1).max(300),
  href: urlSchema,
  userAgent: z.string().trim().min(1).max(1000),
  platform: z.string().trim().max(120),
  locale: z.string().trim().max(50),
  screen: z.object({
    width: z.number().int().min(0).max(10000),
    height: z.number().int().min(0).max(10000),
  }),
  viewport: z.object({
    width: z.number().int().min(0).max(10000),
    height: z.number().int().min(0).max(10000),
  }),
  timezoneOffset: z.number().int().min(-1440).max(1440),
});

export const createSupportTicketInputSchema = z.object({
  uid: idSchema,
  email: emailSchema.nullable(),
  type: supportTicketTypeSchema,
  title: z.string().trim().min(4).max(120),
  message: z.string().trim().min(10).max(2000),
  context: supportTicketContextSchema.nullable(),
  appVersion: z.string().trim().min(1).max(60),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketInputSchema>;
