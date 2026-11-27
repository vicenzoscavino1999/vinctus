import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PersonAvatar } from '@/features/posts/components/PostComments';
import { useGroupName } from '@/features/posts/hooks/useGroupName';

type Props = {
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  /** The group the post was published in, shown as "en <grupo>". */
  groupId?: string | null;
  timeLabel: string;
  /** Right side, e.g. a copy-link or options button. */
  trailing?: ReactNode;
};

/** Who published a post, where and when. The photo and the name open the profile. */
export default function PostAuthorRow({
  authorId,
  authorName,
  authorPhoto,
  groupId,
  timeLabel,
  trailing,
}: Props) {
  const groupName = useGroupName(groupId);
  const profile = authorId ? `/user/${authorId}` : null;

  return (
    <div className="flex items-center gap-3">
      {profile ? (
        <Link to={profile} aria-label={`Perfil de ${authorName}`} className="shrink-0">
          <PersonAvatar name={authorName} photoURL={authorPhoto} size={36} />
        </Link>
      ) : (
        <PersonAvatar name={authorName} photoURL={authorPhoto} size={36} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {profile ? (
            <Link to={profile} className="font-semibold text-white hover:underline">
              {authorName}
            </Link>
          ) : (
            <span className="font-semibold text-white">{authorName}</span>
          )}
          {groupId && groupName && (
            <>
              <span className="text-neutral-500"> en </span>
              <Link
                to={`/group/${groupId}`}
                className="font-medium text-neutral-200 transition-colors hover:text-white"
              >
                {groupName}
              </Link>
            </>
          )}
        </p>
        <p className="text-xs text-neutral-500">{timeLabel}</p>
      </div>
      {trailing}
    </div>
  );
}
