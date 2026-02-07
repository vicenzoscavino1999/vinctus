import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toAppError } from '@/shared/lib/errors';

describe('errors helpers', () => {
  it('maps Firebase permission-denied to AppError PERMISSION_DENIED', () => {
    const source = { code: 'permission-denied', message: 'Access denied' };
    const error = toAppError(source, { operation: 'test' });

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.context.operation).toBe('test');
  });

  it('keeps AppError code and merges context', () => {
    const source = new AppError('Validation failed', 'VALIDATION_FAILED', { field: 'name' });
    const error = toAppError(source, { operation: 'save' });

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.context.field).toBe('name');
    expect(error.context.operation).toBe('save');
  });

  it('detects AppError instances', () => {
    expect(isAppError(new AppError('oops', 'UNKNOWN'))).toBe(true);
    expect(isAppError(new Error('oops'))).toBe(false);
    expect(isAppError({ name: 'AppError', code: 'NOT_FOUND' })).toBe(true);
  });

  it('maps unknown source codes to fallback code', () => {
    const error = toAppError(
      { code: 'not-a-real-code', message: '' },
      { operation: 'read' },
      'TIMEOUT',
    );

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('Unexpected error');
    expect(error.context.operation).toBe('read');
  });

  it('keeps message for Error and string sources', () => {
    const fromError = toAppError(new Error('boom'));
    const fromString = toAppError('plain failure');

    expect(fromError.message).toBe('boom');
    expect(fromError.code).toBe('UNKNOWN');
    expect(fromString.message).toBe('plain failure');
    expect(fromString.code).toBe('UNKNOWN');
  });

  it('handles blank and non-string source codes', () => {
    const blankCode = toAppError({ code: '   ' }, {}, 'NETWORK');
    const nonStringCode = toAppError({ code: 404, message: 'Oops' }, {}, 'NOT_FOUND');

    expect(blankCode.code).toBe('NETWORK');
    expect(nonStringCode.code).toBe('NOT_FOUND');
  });
});
