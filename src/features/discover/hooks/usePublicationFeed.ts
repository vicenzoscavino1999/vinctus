import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/shared/ui/Toast';
import { getGlobalFeed, type PostCursor } from '@/features/posts/api';
import { fetchYouTubeSearchVideos } from '@/shared/lib/youtubeSearchApi';
import { appendToStream, type AppendOnlyStream } from '@/features/discover/model/appendOnlyStream';
import {
  PUBLICATION_BATCH_SIZE,
  PUBLICATION_MAX_ITEMS,
  YOUTUBE_BATCH_SIZE,
  YOUTUBE_FALLBACK_QUERY,
  YOUTUBE_QUERY_DEBOUNCE_MS,
  buildCandidatePublicationStream,
  buildCommunityPublication,
  buildYouTubePublication,
  getPublicationDedupeKey,
  type PublicationStreamItem,
} from '@/features/discover/model/publicationFeed';

/**
 * The Discover "Publicaciones" feed: loads community posts and YouTube videos page by page, mixes
 * them with editorial filler, and grows the rendered list when its sentinel scrolls into view.
 */
export const usePublicationFeed = () => {
  const { showToast } = useToast();

  const publicationLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const publicationObserverLockedRef = useRef(false);
  const [visiblePublicationCount, setVisiblePublicationCount] = useState(PUBLICATION_BATCH_SIZE);
  const [communityPublications, setCommunityPublications] = useState<PublicationStreamItem[]>([]);
  const [communityCursor, setCommunityCursor] = useState<PostCursor>(null);
  const [communityHasMore, setCommunityHasMore] = useState(true);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityReady, setCommunityReady] = useState(false);
  const [youtubeQueryInput, setYoutubeQueryInput] = useState(YOUTUBE_FALLBACK_QUERY);
  const [youtubeQuery, setYoutubeQuery] = useState(YOUTUBE_FALLBACK_QUERY);
  const [youtubePublications, setYoutubePublications] = useState<PublicationStreamItem[]>([]);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | null>(null);
  const [youtubeHasMore, setYoutubeHasMore] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  // Query the current youtubePublications were loaded for; lags youtubeQuery while a search loads.
  const [youtubeResultsQuery, setYoutubeResultsQuery] = useState<string | null>(null);
  const [shownPublications, setShownPublications] = useState<
    AppendOnlyStream<PublicationStreamItem>
  >({ scope: '', items: [] });

  const publicationTargetCount = Math.max(PUBLICATION_BATCH_SIZE, visiblePublicationCount);

  const candidatePublicationStream = useMemo(
    () =>
      buildCandidatePublicationStream({
        communityPublications,
        youtubePublications,
        targetCount: publicationTargetCount,
        youtubeQuery,
      }),
    [communityPublications, youtubePublications, publicationTargetCount, youtubeQuery],
  );

  // Grow the rendered feed only once pending loads settle, and only by appending: items the user
  // already scrolled past never move, so scrolling back up shows the same feed.
  const publicationSourcesSettled =
    communityReady && !communityLoading && youtubeResultsQuery === youtubeQuery && !youtubeLoading;
  if (publicationSourcesSettled) {
    const nextShownPublications = appendToStream(
      shownPublications,
      youtubeQuery,
      candidatePublicationStream,
      publicationTargetCount,
      getPublicationDedupeKey,
    );
    if (nextShownPublications !== shownPublications) {
      setShownPublications(nextShownPublications);
    }
  }
  const publicationStream = shownPublications.scope === youtubeQuery ? shownPublications.items : [];

  const hasMoreEditorial = visiblePublicationCount < PUBLICATION_MAX_ITEMS;
  const hasMorePublications = communityHasMore || youtubeHasMore || hasMoreEditorial;

  useEffect(() => {
    let active = true;

    const loadInitialCommunityPublications = async () => {
      setCommunityLoading(true);
      try {
        const result = await getGlobalFeed(PUBLICATION_BATCH_SIZE);
        if (!active) return;
        const mapped = result.items.map((post, index) => buildCommunityPublication(post, index));
        setCommunityPublications(mapped);
        setCommunityCursor(result.lastDoc ?? null);
        setCommunityHasMore(result.hasMore);
      } catch (error) {
        console.error('Error loading community publications for Discover:', error);
        if (!active) return;
        setCommunityPublications([]);
        setCommunityCursor(null);
        setCommunityHasMore(false);
      } finally {
        if (active) {
          setCommunityLoading(false);
          setCommunityReady(true);
        }
      }
    };

    void loadInitialCommunityPublications();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = youtubeQueryInput.trim().replace(/\s+/g, ' ');
      const nextQuery = normalized.length >= 2 ? normalized : YOUTUBE_FALLBACK_QUERY;
      setYoutubeQuery((prev) => (prev === nextQuery ? prev : nextQuery));
    }, YOUTUBE_QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [youtubeQueryInput]);

  useEffect(() => {
    let active = true;

    const loadInitialYouTubePublications = async () => {
      setYoutubeLoading(true);
      setYoutubeReady(false);
      try {
        const result = await fetchYouTubeSearchVideos({
          query: youtubeQuery,
          limit: YOUTUBE_BATCH_SIZE,
        });
        if (!active) return;

        const mapped = result.items.map((item, index) =>
          buildYouTubePublication(item, index, youtubeQuery),
        );
        const unique = Array.from(new Map(mapped.map((item) => [item.id, item])).values());
        setYoutubePublications(unique);
        setYoutubeNextPageToken(result.nextPageToken ?? null);
        setYoutubeHasMore(Boolean(result.nextPageToken));
      } catch (error) {
        console.error('Error loading YouTube publications for Discover:', error);
        if (!active) return;
        setYoutubePublications([]);
        setYoutubeNextPageToken(null);
        setYoutubeHasMore(false);
      } finally {
        if (active) {
          setYoutubeLoading(false);
          setYoutubeReady(true);
          setYoutubeResultsQuery(youtubeQuery);
        }
      }
    };

    void loadInitialYouTubePublications();
    return () => {
      active = false;
    };
  }, [youtubeQuery]);

  const loadMoreCommunityPublications = useCallback(async () => {
    if (communityLoading || !communityHasMore) return;
    setCommunityLoading(true);
    try {
      const result = await getGlobalFeed(PUBLICATION_BATCH_SIZE, communityCursor ?? undefined);
      setCommunityPublications((prev) => {
        const offset = prev.length;
        const mapped = result.items.map((post, index) =>
          buildCommunityPublication(post, offset + index),
        );
        return [...prev, ...mapped];
      });
      setCommunityCursor(result.lastDoc ?? null);
      setCommunityHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more community publications for Discover:', error);
      setCommunityHasMore(false);
      showToast('No se pudieron cargar más publicaciones de la comunidad.', 'error');
    } finally {
      setCommunityLoading(false);
    }
  }, [communityLoading, communityHasMore, communityCursor, showToast]);

  const loadMoreYouTubePublications = useCallback(async () => {
    if (youtubeLoading || !youtubeHasMore || !youtubeNextPageToken) return;
    setYoutubeLoading(true);
    try {
      const result = await fetchYouTubeSearchVideos({
        query: youtubeQuery,
        limit: YOUTUBE_BATCH_SIZE,
        pageToken: youtubeNextPageToken,
      });
      setYoutubePublications((prev) => {
        const offset = prev.length;
        const mapped = result.items.map((item, index) =>
          buildYouTubePublication(item, offset + index, youtubeQuery),
        );
        return Array.from(new Map([...prev, ...mapped].map((item) => [item.id, item])).values());
      });
      setYoutubeNextPageToken(result.nextPageToken ?? null);
      setYoutubeHasMore(Boolean(result.nextPageToken));
    } catch (error) {
      console.error('Error loading more YouTube publications for Discover:', error);
      setYoutubeHasMore(false);
      showToast('No se pudieron cargar mas videos de YouTube.', 'error');
    } finally {
      setYoutubeLoading(false);
    }
  }, [youtubeHasMore, youtubeLoading, youtubeNextPageToken, youtubeQuery, showToast]);

  useEffect(() => {
    // Wait for the current batch to render before asking for the next one.
    if (!hasMorePublications || !publicationSourcesSettled) return;
    const sentinel = publicationLoadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting || publicationObserverLockedRef.current) return;
        publicationObserverLockedRef.current = true;
        setVisiblePublicationCount((prev) =>
          Math.min(prev + PUBLICATION_BATCH_SIZE, PUBLICATION_MAX_ITEMS),
        );
        if (communityHasMore) {
          void loadMoreCommunityPublications();
        }
        if (youtubeHasMore) {
          void loadMoreYouTubePublications();
        }
        window.setTimeout(() => {
          publicationObserverLockedRef.current = false;
        }, 220);
      },
      {
        root: null,
        rootMargin: '420px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMorePublications,
    publicationSourcesSettled,
    communityHasMore,
    youtubeHasMore,
    loadMoreCommunityPublications,
    loadMoreYouTubePublications,
  ]);

  const loadNextPublicationBatch = () => {
    setVisiblePublicationCount((prev) =>
      Math.min(prev + PUBLICATION_BATCH_SIZE, PUBLICATION_MAX_ITEMS),
    );
    if (communityHasMore) {
      void loadMoreCommunityPublications();
    }
    if (youtubeHasMore) {
      void loadMoreYouTubePublications();
    }
  };

  return {
    publicationStream,
    hasMorePublications,
    loadNextPublicationBatch,
    publicationLoadMoreRef,
    youtubeQueryInput,
    setYoutubeQueryInput,
    youtubeLoading,
    youtubeReady,
    youtubeCount: youtubePublications.length,
    communityLoading,
    communityReady,
    communityCount: communityPublications.length,
  };
};

export type PublicationFeed = ReturnType<typeof usePublicationFeed>;
