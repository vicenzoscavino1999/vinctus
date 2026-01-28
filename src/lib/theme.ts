export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'vinctus_theme';

export const getStoredTheme = (): ThemeMode => {
    if (typeof window === 'undefined') return 'system';
    try {
        const stored = window.localStorage?.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light' || stored === 'system') {
            return stored;
        }
    } catch {
        return 'system';
    }
    return 'system';
};

export const setStoredTheme = (theme: ThemeMode): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage?.setItem(STORAGE_KEY, theme);
    } catch {
        // ignore storage errors
    }
};

const resolveTheme = (theme: ThemeMode): 'dark' | 'light' => {
    if (theme !== 'system') return theme;
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (theme: ThemeMode): void => {
    if (typeof document === 'undefined') return;
    const resolved = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', resolved);
};

export const initTheme = (): (() => void) => {
    applyTheme(getStoredTheme());
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
        if (getStoredTheme() === 'system') {
            applyTheme('system');
        }
    };

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
};
