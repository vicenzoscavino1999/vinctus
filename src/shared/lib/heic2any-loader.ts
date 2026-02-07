type Heic2AnyOptions = {
  blob: Blob;
  toType?: string;
  quality?: number;
  [key: string]: unknown;
};

type Heic2AnyResult = Blob | Blob[];
type Heic2AnyFn = (options: Heic2AnyOptions) => Promise<Heic2AnyResult>;

declare global {
  interface Window {
    heic2any?: Heic2AnyFn;
  }
}

const HEIC2ANY_SRC = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

let heic2anyPromise: Promise<Heic2AnyFn> | null = null;

const getHeic2AnyFromWindow = (): Heic2AnyFn | null => {
  if (typeof window === 'undefined') return null;
  return typeof window.heic2any === 'function' ? window.heic2any : null;
};

export const loadHeic2Any = async (): Promise<Heic2AnyFn> => {
  const existing = getHeic2AnyFromWindow();
  if (existing) return existing;

  if (typeof document === 'undefined') {
    throw new Error('HEIC conversion is only available in browser environments.');
  }

  if (!heic2anyPromise) {
    heic2anyPromise = new Promise<Heic2AnyFn>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HEIC2ANY_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';

      script.onload = () => {
        const loaded = getHeic2AnyFromWindow();
        if (!loaded) {
          reject(new Error('HEIC converter script loaded but API is unavailable.'));
          return;
        }
        resolve(loaded);
      };

      script.onerror = () => {
        reject(new Error('Failed to load HEIC converter script.'));
      };

      document.head.append(script);
    });
  }

  try {
    return await heic2anyPromise;
  } catch (error) {
    heic2anyPromise = null;
    throw error;
  }
};
