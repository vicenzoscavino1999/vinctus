export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * The light theme only switches the CSS variables in index.css, but most components still use
 * hard-coded dark classes (neutral-900, white text…), so in light mode they become unreadable.
 * Until the components use the theme tokens, the app stays dark and Settings hides the choice;
 * a stored 'light' or 'system' preference is kept and applies again once this is turned on.
 */
export const LIGHT_THEME_AVAILABLE: boolean = false;

const STORAGE_KEY = 'vinctus_theme';

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    return 'dark';
  }
  return 'dark';
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
  if (!LIGHT_THEME_AVAILABLE) return 'dark';
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
