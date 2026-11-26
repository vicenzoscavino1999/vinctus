import { getToken } from 'firebase/app-check';
import { appCheck, auth } from '@/shared/lib/firebase';

const PREFIX = 'post-media:';
export const POST_MEDIA_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 100 * 1024 * 1024;
export const APP_CHECK_TOKEN_TIMEOUT_MS = 3000;

async function getOptionalAppCheckToken(
  timeoutMs = APP_CHECK_TOKEN_TIMEOUT_MS,
): Promise<string | null> {
  if (!appCheck) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const tokenPromise = getToken(appCheck, false)
      .then((result) => result?.token?.trim() || null)
      .catch(() => null);
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([tokenPromise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}
export const isProtectedPostMedia = (source: string | undefined): source is string =>
  !!source?.startsWith(PREFIX);

export function postMediaLocation(source: string) {
  if (!isProtectedPostMedia(source)) throw new Error('El adjunto no es válido.');
  const path = source.slice(PREFIX.length);
  const parts = path.split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== 'posts' ||
    !parts[1] ||
    !parts[2] ||
    !parts[4] ||
    !['images', 'videos', 'files'].includes(parts[3]) ||
    path.length > 300 ||
    [...path].some((char) => char.charCodeAt(0) < 32)
  ) {
    throw new Error('El adjunto no es válido.');
  }
  return { postId: parts[2], path };
}

export function postMediaEndpoint(source: string): string {
  const { postId, path } = postMediaLocation(source);
  const project = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!project) throw new Error('No se pudo cargar el adjunto.');
  const base =
    import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
      ? `http://${import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'}:5001/${project}/us-central1`
      : `https://us-central1-${project}.cloudfunctions.net`;
  return `${base}/readPostMedia?${new URLSearchParams({ postId, path })}`;
}

/**
 * One GET without Range. The function answers 200 with the whole file when it fits in one chunk
 * and 416 when it does not; then (or when the length cannot be checked) this returns null and the
 * caller downloads it by ranges.
 */
async function downloadWhole(
  endpoint: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Blob | null> {
  const response = await fetch(endpoint, {
    headers,
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (response.status === 416) return null;
  if (response.status !== 200) throw new Error('El adjunto ya no está disponible.');
  const size = Number(response.headers.get('Content-Length'));
  if (
    !response.headers.has('Content-Length') ||
    !response.headers.get('ETag') ||
    !Number.isSafeInteger(size)
  ) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (size < 0 || size > POST_MEDIA_CHUNK_BYTES) throw new Error('El adjunto no es válido.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== size) throw new Error('No se pudo completar la descarga.');
  return new Blob([bytes], {
    type: response.headers.get('Content-Type') || 'application/octet-stream',
  });
}

export async function downloadPostMedia(
  source: string,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
  expectedUid?: string | null,
): Promise<Blob> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid || auth.currentUser?.isAnonymous)
    throw new Error('Inicia sesión para descargar el adjunto.');
  if (expectedUid !== undefined && uid !== expectedUid) throw new Error('La sesión cambió.');
  const endpoint = postMediaEndpoint(source);
  const appCheckToken = await getOptionalAppCheckToken();
  const headers = async (): Promise<Record<string, string>> => {
    if ((auth.currentUser?.uid ?? null) !== uid) throw new Error('La sesión cambió.');
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if ((auth.currentUser?.uid ?? null) !== uid) throw new Error('La sesión cambió.');
    const result: Record<string, string> = {};
    if (token) {
      result.Authorization = `Bearer ${token}`;
    }
    if (appCheckToken) {
      result['X-Firebase-AppCheck'] = appCheckToken;
    }
    return result;
  };
  // A photo almost always fits in one response: ask for it whole, which saves the HEAD round
  // trip (each request to the function verifies the session and the access again).
  if (postMediaLocation(source).path.split('/')[3] === 'images') {
    const whole = await downloadWhole(endpoint, await headers(), signal);
    if (whole) {
      if ((auth.currentUser?.uid ?? null) !== uid || signal.aborted)
        throw new Error('La descarga se canceló.');
      onProgress?.(1);
      return whole;
    }
  }
  const metadata = await fetch(endpoint, {
    method: 'HEAD',
    headers: await headers(),
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!metadata.ok) throw new Error('El adjunto ya no está disponible.');
  const size = Number(metadata.headers.get('Content-Length'));
  const etag = metadata.headers.get('ETag');
  if (
    !metadata.headers.has('Content-Length') ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > MAX_BYTES ||
    !etag
  ) {
    throw new Error('El adjunto no es válido.');
  }
  const parts: ArrayBuffer[] = [];
  for (let start = 0; start < size; start += POST_MEDIA_CHUNK_BYTES) {
    const end = Math.min(size - 1, start + POST_MEDIA_CHUNK_BYTES - 1);
    const response: Response = await fetch(endpoint, {
      headers: { ...(await headers()), Range: `bytes=${start}-${end}`, 'If-Match': etag },
      signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (
      response.status !== 206 ||
      response.headers.get('ETag') !== etag ||
      response.headers.get('Content-Range') !== `bytes ${start}-${end}/${size}`
    ) {
      throw new Error('El adjunto cambió o ya no está disponible.');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== end - start + 1) throw new Error('No se pudo completar la descarga.');
    parts.push(bytes);
    onProgress?.((end + 1) / Math.max(1, size));
  }
  if ((auth.currentUser?.uid ?? null) !== uid || signal.aborted)
    throw new Error('La descarga se canceló.');
  return new Blob(parts, {
    type: metadata.headers.get('Content-Type') || 'application/octet-stream',
  });
}
