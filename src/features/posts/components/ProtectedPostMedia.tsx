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

function ProtectedImage({ src = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const media = useMedia(src);
  if (media.error)
    return <span role="img" aria-label="Imagen no disponible" className={props.className} />;
  return <img {...props} src={media.url || undefined} aria-busy={media.loading} />;
}

export function PostImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return isProtectedPostMedia(props.src) ? <ProtectedImage {...props} /> : <img {...props} />;
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
