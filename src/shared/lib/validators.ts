import { z } from 'zod';
import { AppError } from '@/shared/lib/errors';

export const idSchema = z.string().trim().min(1).max(128);
export const emailSchema = z.string().trim().email();
export const urlSchema = z.string().trim().url();
export const limitSchema = z.coerce.number().int().min(1).max(50);

const normalizeFallback = (fallback: number): number => {
  const parsed = limitSchema.safeParse(fallback);
  return parsed.success ? parsed.data : 20;
};

export const safeLimit = (value: unknown, fallback = 20): number => {
  const parsed = limitSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(50, Math.max(1, Math.trunc(numeric)));
  }

  return normalizeFallback(fallback);
};

export const validate = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  context: Record<string, unknown> = {},
): z.infer<TSchema> => {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw new AppError('Validation failed', 'VALIDATION_FAILED', {
    ...context,
    issues: result.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.join('.'),
    })),
  });
};
