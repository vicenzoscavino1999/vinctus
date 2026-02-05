import { describe, it, expect } from 'vitest';
import { AppError, isAppError, toAppError } from './errors';

describe('errors', () => {
  it('AppError has code + message', () => {
    const err = new AppError('NOT_FOUND', 'Missing', { context: { id: 'x' } });
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Missing');
    expect(err.context).toEqual({ id: 'x' });
  });

  it('isAppError detects AppError', () => {
    expect(isAppError(new AppError('UNKNOWN', 'x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  it('toAppError maps Firebase-like error codes', () => {
    const fbError = Object.assign(new Error('Denied'), { code: 'permission-denied' });
    const err = toAppError(fbError);
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.context?.externalCode).toBe('permission-denied');
    expect(err.cause).toBe(fbError);
  });

  it('toAppError maps AbortError name to TIMEOUT', () => {
    const abortError = { name: 'AbortError', message: 'aborted' };
    const err = toAppError(abortError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('aborted');
  });
});
