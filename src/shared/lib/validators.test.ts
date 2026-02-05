import { describe, it, expect } from 'vitest';
import { validate, z, idSchema, safeLimitSchema } from './validators';
import { isAppError } from './errors';

describe('validators', () => {
  it('validate returns typed data', () => {
    const schema = z.object({
      id: idSchema,
      limit: safeLimitSchema.optional(),
    });

    const data = validate(schema, { id: 'abc', limit: 10 });
    expect(data).toEqual({ id: 'abc', limit: 10 });
  });

  it('validate throws AppError on invalid data', () => {
    const schema = z.object({ id: idSchema });

    try {
      validate(schema, { id: '' });
      throw new Error('Expected validate() to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(Array.isArray(error.context?.issues)).toBe(true);
      }
    }
  });
});
