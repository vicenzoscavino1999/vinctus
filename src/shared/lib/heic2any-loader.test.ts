import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('heic2any-loader', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    delete window.heic2any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete window.heic2any;
  });

  it('loads heic2any with pinned URL, SRI integrity, anonymous CORS, and no-referrer policy', async () => {
    const appended: HTMLScriptElement[] = [];
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLScriptElement) {
          appended.push(node);
        }
      }
    });

    const { HEIC2ANY_INTEGRITY, HEIC2ANY_SRC, loadHeic2Any } = await import('./heic2any-loader');
    const mockFn = vi.fn();

    const pending = loadHeic2Any();
    const script = appended[0];
    expect(script).toBeDefined();
    expect(script.src).toBe(HEIC2ANY_SRC);
    expect(script.crossOrigin).toBe('anonymous');
    expect(script.integrity).toBe(HEIC2ANY_INTEGRITY);
    expect(script.referrerPolicy).toBe('no-referrer');

    window.heic2any = mockFn;
    script.onload?.(new Event('load'));

    await expect(pending).resolves.toBe(mockFn);
  });

  it('removes failed script element so a subsequent retry can succeed cleanly', async () => {
    const appended: HTMLScriptElement[] = [];
    const removeSpies: Array<ReturnType<typeof vi.spyOn>> = [];
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLScriptElement) {
          removeSpies.push(vi.spyOn(node, 'remove'));
          appended.push(node);
        }
      }
    });

    const { loadHeic2Any } = await import('./heic2any-loader');

    const firstAttempt = loadHeic2Any();
    expect(appended).toHaveLength(1);
    appended[0].onerror?.(new Event('error'));

    await expect(firstAttempt).rejects.toThrow('Failed to load HEIC converter script.');
    expect(removeSpies[0]).toHaveBeenCalledTimes(1);

    const mockFn = vi.fn();
    const secondAttempt = loadHeic2Any();
    expect(appended).toHaveLength(2);
    window.heic2any = mockFn;
    appended[1].onload?.(new Event('load'));

    await expect(secondAttempt).resolves.toBe(mockFn);
  });
});
