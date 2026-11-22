import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl, normalizeKeyword } from './textHelpers';

describe('normalizeKeyword', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeKeyword('Física Cuántica')).toBe('fisica cuantica');
    expect(normalizeKeyword('ANTIGÜEDAD')).toBe('antiguedad');
  });
});

describe('isSafeHttpUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(isSafeHttpUrl('https://arxiv.org/abs/1')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects other schemes, relative paths and empty values', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false);
    expect(isSafeHttpUrl('/post/1')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});
