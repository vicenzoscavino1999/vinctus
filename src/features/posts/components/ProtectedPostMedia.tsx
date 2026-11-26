import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
} from 'react';
import { useAuth } from '@/context/auth';
import { downloadPostMedia, isProtectedPostMedia } from '@/shared/lib/protected-post-media';
import {
  cachedPostImageUrl,
  loadPostImageUrl,
  retainPostImage,
} from '@/shared/lib/post-image-cache';

function useMedia(source: string, enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([uid, source, enabled, attempt]);
  const [state, setState] = useState({
    key: '',
    url: '',
    loading: false,
    error: false,
    progress: 0,
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let objectURL = '';
    void downloadPostMedia(
      source,
      controller.signal,
      (progress) => {
        if (!controller.signal.aborted)
          setState({ key, url: '', loading: true, error: false, progress });
      },
      uid,
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectURL = URL.createObjectURL(blob);
        setState({ key, url: objectURL, loading: false, error: false, progress: 1 });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, url: '', loading: false, error: true, progress: 0 });
      });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [source, key, uid, enabled, attempt]);
  return {
    ...(state.key === key ? state : { url: '', loading: enabled, error: false, progress: 0 }),
    retry: () => setAttempt((value) => value + 1),
  };
}

/** How far outside the screen a photo starts downloading. */
const PREFETCH_MARGIN = '400px 300px';

/**
 * A protected photo: downloaded only when it gets close to the screen, once per session (see
 * post-image-cache), with a shimmer while it loads and a short fade when it appears.
 */
function ProtectedImage({
  src = '',
  className = '',
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const node = useRef<HTMLImageElement>(null);
  const key = `${uid}\n${src}`;
  const [nearKey, setNearKey] = useState<string | null>(null);
  const [result, setResult] = useState({ key: '', url: '', error: false });
  const cached = uid ? cachedPostImageUrl(src, uid) : null;
  const url = cached || (result.key === key ? result.url : '');
  const error = !url && (!uid || (result.key === key && result.error));
  const near = nearKey === key || typeof IntersectionObserver === 'undefined';

  useEffect(() => {
    if (url || near || !node.current) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setNearKey(key);
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node.current);
    return () => observer.disconnect();
  }, [key, near, url]);

  useEffect(() => {
    if (url || !near || !uid) return;
    let active = true;
    loadPostImageUrl(src, uid).then(
      (loaded) => {
        if (active) setResult({ key, url: loaded, error: false });
      },
      () => {
        if (active) setResult({ key, url: '', error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [key, near, src, uid, url]);

  useEffect(() => (url ? retainPostImage(src) : undefined), [src, url]);

  if (error) return <span role="img" aria-label="Imagen no disponible" className={className} />;
  return (
    <img
      ref={node}
      {...props}
      src={url || undefined}
      aria-busy={!url}
      className={`${className} ${url ? 'post-media-ready' : 'post-media-loading'}`}
    />
  );
}

export function PostImage({ loading = 'lazy', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return isProtectedPostMedia(props.src) ? (
    <ProtectedImage {...props} />
  ) : (
    <img loading={loading} decoding="async" {...props} />
  );
}

function ProtectedVideo({ src = '', ...props }: VideoHTMLAttributes<HTMLVideoElement>) {
  const media = useMedia(src);
  if (media.error)
    return (
      <button type="button" onClick={media.retry} className="p-4 text-sm text-neutral-300">
        Reintentar video
      </button>
    );
  if (!media.url)
    return (
      <p role="status" className="p-4 text-sm text-neutral-400">
        Cargando video… {Math.round(media.progress * 100)} %
      </p>
    );
  return <video {...props} src={media.url} />;
}

export function PostVideo(props: VideoHTMLAttributes<HTMLVideoElement>) {
  return isProtectedPostMedia(props.src) ? <ProtectedVideo {...props} /> : <video {...props} />;
}

function ProtectedDownload({
  href = '',
  children,
  download,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [active, setActive] = useState(false);
  const requested = useRef(false);
  const media = useMedia(href, active);
  const filename =
    typeof download === 'string' && download ? download : href.split('/').pop() || 'archivo';
  useEffect(() => {
    if (!requested.current || !media.url) return;
    requested.current = false;
    const anchor = document.createElement('a');
    anchor.href = media.url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, [media.url, filename]);
  return (
    <>
      <a
        {...props}
        href={media.url || '#'}
        download={filename}
        aria-busy={media.loading}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || media.url) return;
          event.preventDefault();
          if (media.loading) return;
          requested.current = true;
          if (!active) setActive(true);
          else media.retry();
        }}
      >
        {children}
      </a>
      {media.loading && (
        <p role="status" className="text-xs text-neutral-400">
          Preparando archivo… {Math.round(media.progress * 100)} %
        </p>
      )}
      {media.error && (
        <p role="alert" className="text-xs text-red-400">
          No se pudo descargar. Vuelve a intentarlo.
        </p>
      )}
    </>
  );
}

export function PostDownload(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return isProtectedPostMedia(props.href) ? (
    <ProtectedDownload {...props} target={undefined} />
  ) : (
    <a {...props} />
  );
}
