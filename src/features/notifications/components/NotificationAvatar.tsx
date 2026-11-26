import { useState, type ReactNode } from 'react';

const isSafeAvatarUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

type Props = {
  name: string;
  photoURL?: string | null;
  size?: number;
  className?: string;
};

/** A round profile photo, or the initial when there is none or it fails to load. */
export default function NotificationAvatar({ name, photoURL, size = 44, className = '' }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const candidate = isSafeAvatarUrl(photoURL) ? photoURL.trim() : null;
  const src = candidate && failedSrc !== candidate ? candidate : null;
  const style = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailedSrc(src)}
        style={style}
        className={`shrink-0 rounded-full bg-neutral-800 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-200 ${className}`}
    >
      {(name.trim() || 'U').charAt(0).toUpperCase()}
    </span>
  );
}

/** Up to two people (overlapped) with a small badge that says what happened. */
export function ActorStack({
  actors,
  badge,
}: {
  actors: Array<{ name: string; photoURL: string | null }>;
  badge: ReactNode;
}) {
  const [first, second] = actors;
  return (
    <span className="relative block h-11 w-11 shrink-0">
      {second ? (
        <>
          <NotificationAvatar
            name={second.name}
            photoURL={second.photoURL}
            size={32}
            className="absolute right-0 top-0"
          />
          <NotificationAvatar
            name={first.name}
            photoURL={first.photoURL}
            size={32}
            className="absolute bottom-0 left-0 ring-2 ring-surface-base"
          />
        </>
      ) : (
        <NotificationAvatar name={first?.name ?? 'Usuario'} photoURL={first?.photoURL} />
      )}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-surface-base">
        {badge}
      </span>
    </span>
  );
}
