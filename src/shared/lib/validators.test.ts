import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import { idSchema, safeLimit, validate } from '@/shared/lib/validators';

describe('validators helpers', () => {
  it('validate returns parsed data when schema is valid', () => {
    const value = validate(idSchema, '  user_123  ');
    expect(value).toBe('user_123');
  });

  it('validate throws AppError on invalid data', () => {
    const run = () => validate(idSchema, '');

    expect(run).toThrowError(AppError);
    expect(run).toThrowError('Validation failed');
  });

  it('safeLimit clamps numeric values to [1, 50]', () => {
    expect(safeLimit(0)).toBe(1);
    expect(safeLimit(250)).toBe(50);
    expect(safeLimit(10)).toBe(10);
  });

  it('safeLimit uses fallback for non numeric values', () => {
    expect(safeLimit('abc', 7)).toBe(7);
    expect(safeLimit(undefined)).toBe(20);
  });
});
