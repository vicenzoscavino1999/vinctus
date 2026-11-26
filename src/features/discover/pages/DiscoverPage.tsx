import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/auth';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import SearchFilters from '@/features/discover/components/SearchFilters';
import DiscoverHeader from '@/features/discover/components/DiscoverHeader';
import DiscoverPostsSection from '@/features/discover/components/DiscoverPostsSection';
import InterestsSection from '@/features/discover/components/InterestsSection';
import GroupsSection from '@/features/discover/components/GroupsSection';
import DebatesSection from '@/features/discover/components/DebatesSection';
import VideosSection from '@/features/discover/components/VideosSection';
import type { DiscoverFilters } from '@/features/discover/model/discoverCatalog';

/**
 * Discover, the home of the app: stories, then posts, interests, groups, AI debates and videos.
 * Each section loads and caches its own data (useSessionResource), so a slow source never holds
 * the others back and coming back to the page shows everything at once. While searching or
 * filtering by category only the results (interests and groups) are shown.
 */
const DiscoverSession = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<DiscoverFilters>({ category: null, sortBy: 'relevance' });
  const searching = Boolean(query.trim() || filters.category);

  const setQuery = (value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );

  return (
    <div className="page-discover space-y-10 pb-32 pt-2 md:space-y-14 md:pt-6">
      <StoriesWidget />

      <DiscoverHeader
        query={query}
        onQueryChange={setQuery}
        filtersActive={Boolean(filters.category) || filters.sortBy !== 'relevance'}
        onOpenFilters={() => setShowFilters(true)}
      />

      {!searching && <DiscoverPostsSection />}
      <InterestsSection query={query} filters={filters} />
      <GroupsSection query={query} filters={filters} />
      {searching ? (
        query.trim() && (
          <button
            type="button"
            onClick={() => navigate(`/search?q=${encodeURIComponent(query.trim())}`)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-surface-overlay px-4 py-3.5 text-left text-sm text-neutral-300 transition-colors hover:border-white/[0.14] hover:text-white"
          >
            <span>
              Buscar personas que coincidan con <span className="text-white">“{query.trim()}”</span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-brand-gold" />
          </button>
        )
      ) : (
        <>
          <DebatesSection />
          <VideosSection />
        </>
      )}

      <SearchFilters
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onApply={setFilters}
      />
    </div>
  );
};

const DiscoverPage = () => {
  const { user } = useAuth();
  return <DiscoverSession key={user?.uid ?? 'anonymous'} />;
};
export default DiscoverPage;
