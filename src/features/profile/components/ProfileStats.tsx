type Props = {
  posts: number;
  followers: number;
  following: number;
  onOpenFollowers: () => void;
  onOpenFollowing: () => void;
};

const cardClass =
  'min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/30 px-2 py-3 text-center sm:px-4';
const labelClass =
  'truncate text-[10px] uppercase tracking-wider text-neutral-500 sm:text-xs sm:tracking-widest';
const valueClass = 'mt-1 text-lg font-semibold text-white tabular-nums';

const format = (value: number) => value.toLocaleString('es-ES');

/** Publicaciones, Seguidores and Siguiendo; the last two open the lists. */
export default function ProfileStats({
  posts,
  followers,
  following,
  onOpenFollowers,
  onOpenFollowing,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={cardClass}>
        <div className={labelClass}>Publicaciones</div>
        <div className={valueClass}>{format(posts)}</div>
      </div>
      <button
        type="button"
        onClick={onOpenFollowers}
        className={`${cardClass} transition-colors hover:border-neutral-700 hover:bg-neutral-800/40`}
      >
        <div className={labelClass}>Seguidores</div>
        <div className={valueClass}>{format(followers)}</div>
      </button>
      <button
        type="button"
        onClick={onOpenFollowing}
        className={`${cardClass} transition-colors hover:border-neutral-700 hover:bg-neutral-800/40`}
      >
        <div className={labelClass}>Siguiendo</div>
        <div className={valueClass}>{format(following)}</div>
      </button>
    </div>
  );
}
