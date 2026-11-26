import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { getGlobalFeed } from '@/features/posts/api';
import { toPostSummary } from '@/features/posts/model/postSummary';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import DiscoverPostTile from '@/features/discover/components/DiscoverPostTile';
import DiscoverSection, {
  SectionEmpty,
  SectionError,
  SectionLink,
} from '@/features/discover/components/DiscoverSection';
import Rail, { RailItem } from '@/features/discover/components/Rail';

const POSTS_IN_DISCOVER = 8;
const TILE_WIDTH = 'w-[248px] md:w-[264px]';

/** "Publicaciones": the latest posts in a row, and "Ver todo" for the whole feed. */
export default function DiscoverPostsSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const posts = useSessionResource(
    `discover:posts:${user?.uid ?? 'anonymous'}`,
    () => getGlobalFeed(POSTS_IN_DISCOVER),
    60_000,
  );
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const handleLikeCount = useCallback((postId: string, count: number) => {
    setLikeCounts((previous) =>
      previous[postId] === count ? previous : { ...previous, [postId]: count },
    );
  }, []);

  const openPost = (postId: string, openComments = false) =>
    navigate(`/post/${postId}`, {
      state: {
        fromDiscover: true,
        source: 'publication-feed',
        ...(openComments ? { openComments: true } : {}),
      },
    });

  const items = posts.data?.items ?? [];

  return (
    <DiscoverSection
      title="Publicaciones"
      action={<SectionLink onClick={() => navigate('/feed')}>Ver todo</SectionLink>}
    >
      {items.length > 0 ? (
        <Rail label="Publicaciones recientes">
          {items.map((post) => {
            const summary = toPostSummary(post);
            return (
              <RailItem key={summary.postId} className={TILE_WIDTH}>
                <DiscoverPostTile
                  summary={summary}
                  timeLabel={formatRelativeTime(post.createdAt)}
                  initialLikeCount={likeCounts[summary.postId] ?? summary.likeCount}
                  onOpen={() => openPost(summary.postId)}
                  onComments={() => openPost(summary.postId, true)}
                  onLikeCount={handleLikeCount}
                />
              </RailItem>
            );
          })}
        </Rail>
      ) : posts.error ? (
        <SectionError message="No se pudieron cargar las publicaciones." onRetry={posts.reload} />
      ) : posts.data ? (
        <SectionEmpty>Aún no hay publicaciones. Comparte la primera con el botón +.</SectionEmpty>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:gap-4 md:px-0" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className={`${TILE_WIDTH} shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-overlay`}
            >
              <div className="skeleton aspect-[4/5] rounded-none" />
              <div className="space-y-2 p-3.5">
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </DiscoverSection>
  );
}
