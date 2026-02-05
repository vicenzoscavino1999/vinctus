import { z, type ZodTypeAny } from 'zod';
import { AppError, type AppErrorContext } from './errors';

export { z };

export const emailSchema = z.string().email();
export const urlSchema = z.string().url();
export const idSchema = z.string().min(1);

export const safeLimitSchema = z.number().int().min(1).max(50);

export const validate = <TSchema extends ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  options?: { message?: string; context?: AppErrorContext },
): z.infer<TSchema> => {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw new AppError('VALIDATION_FAILED', options?.message ?? 'Validation failed', {
    context: {
      ...options?.context,
      issues: result.error.issues,
    },
    cause: result.error,
  });
};
