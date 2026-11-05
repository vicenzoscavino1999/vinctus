import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Filter, Search } from 'lucide-react';
import SearchFilters from '@/features/discover/components/SearchFilters';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import TrendsSection from '@/features/discover/components/TrendsSection';
import CuratedDebatesSection from '@/features/discover/components/CuratedDebatesSection';
import RecommendedGroupsSection from '@/features/discover/components/RecommendedGroupsSection';
import PublicationFeedSection from '@/features/discover/components/PublicationFeedSection';
import YouTubePlayerModal from '@/features/discover/components/YouTubePlayerModal';
import { useCuratedDebates } from '@/features/discover/hooks/useCuratedDebates';
import { usePublicationFeed } from '@/features/discover/hooks/usePublicationFeed';
import { useRecommendedGroups } from '@/features/discover/hooks/useRecommendedGroups';
import { useTrendCategories } from '@/features/discover/hooks/useTrendCategories';
import {
  filterDiscoverCategories,
  readStoredUserInterests,
  type SearchFiltersState,
} from '@/features/discover/model/categoryFilter';
import type { PublicationStreamItem } from '@/features/discover/model/publicationFeed';
import { useAppState } from '@/context/app-state';
import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';
import { useToast } from '@/shared/ui/Toast';

type DiscoverCategoryNavigationSource =
  | 'trend-card'
  | 'trend-preview'
  | 'category-grid'
  | 'publication-feed';

const DiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  // Load user interests from onboarding for personalization
  const userInterests = useMemo(() => readStoredUserInterests(), []);

  // Use global state from context
  const {
    toggleSaveCategory,
    isCategorySaved,
    followedCategories,
    toggleFollowCategory,
    isCategoryFollowed,
    toggleLikePost,
    isPostLiked,
    toggleSavePost,
    isPostSaved,
  } = useAppState();
  const { showToast } = useToast();

  // Search filters state (local, not persisted)
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFiltersState>({
    category: null,
    sortBy: 'relevance',
  });
  const [activeYouTubePublication, setActiveYouTubePublication] =
    useState<PublicationStreamItem | null>(null);
  const closeYouTubePlayer = useCallback(() => setActiveYouTubePublication(null), []);

  const filteredCategories = useMemo(
    () => filterDiscoverCategories(CATEGORIES, { searchQuery, filters, userInterests }),
    [searchQuery, filters, userInterests],
  );

  const recommendedGroups = useRecommendedGroups();
  const curatedDebates = useCuratedDebates();
  const publicationFeed = usePublicationFeed();
  const trends = useTrendCategories({
    categories: filteredCategories,
    groups: recommendedGroups.allGroups,
    followedCategories,
    userInterests,
  });

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchParams(value ? { q: value } : {}, { replace: true });
  };

  const openCategoryFromDiscover = (
    categoryId: string,
    source: DiscoverCategoryNavigationSource,
  ) => {
    navigate(`/category/${categoryId}`, {
      state: {
        fromDiscover: true,
        source,
        enteredAt: Date.now(),
      },
    });
  };

  const openPublicationFromDiscover = (publication: PublicationStreamItem) => {
    if (publication.source === 'youtube') {
      setActiveYouTubePublication(publication);
      return;
    }
    if (publication.postId) {
      navigate(`/post/${publication.postId}`, {
        state: {
          fromDiscover: true,
          source: 'publication-feed',
          enteredAt: Date.now(),
        },
      });
      return;
    }
    openCategoryFromDiscover(publication.categoryId, 'publication-feed');
  };

  const openPublicationComments = (postId: string) => {
    navigate(`/post/${postId}`, {
      state: {
        fromDiscover: true,
        source: 'publication-feed',
        enteredAt: Date.now(),
        openComments: true,
      },
    });
  };

  const toggleFollowFromTrend = (category: Category) => {
    const alreadyFollowed = isCategoryFollowed(category.id);
    toggleFollowCategory(category.id);
    showToast(
      alreadyFollowed ? 'Categoria dejada de seguir' : 'Categoria seguida',
      alreadyFollowed ? 'info' : 'success',
    );
  };

  return (
    <div className="page-discover pb-32">
      <header className="mb-12 pt-6 md:pt-10 flex flex-col items-center text-center">
        <div className="w-full max-w-4xl mb-8">
          <StoriesWidget />
        </div>
        <span className="text-caption font-medium tracking-[0.3em] text-neutral-500 uppercase mb-4">
          DESCUBRIR
        </span>
        <h1 className="text-display-sm md:text-display-md font-display font-normal text-white mb-8 tracking-tight">
          Curaduria de <span className="text-brand-gold italic">Intereses</span>
        </h1>

        <div className="w-full max-w-lg mt-4">
          <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              aria-label="Abrir filtros"
              className={`p-1 rounded transition-colors ${filters.category || filters.sortBy !== 'relevance' ? 'text-brand-gold' : 'text-neutral-600 hover:text-white'}`}
            >
              <Filter size={18} />
            </button>
            <input
              type="text"
              aria-label="Buscar intereses o grupos"
              placeholder="Buscar intereses o grupos..."
              value={searchQuery}
              onChange={handleSearch}
              className="flex-1 bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
            />
            <Search className="text-neutral-600" size={18} />
          </div>
        </div>
      </header>

      <SearchFilters
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onApply={setFilters}
      />

      <TrendsSection
        trends={trends}
        isCategorySaved={isCategorySaved}
        isCategoryFollowed={isCategoryFollowed}
        onToggleFollow={toggleFollowFromTrend}
        onToggleSave={(category) => toggleSaveCategory(category.id)}
        onOpenCategory={openCategoryFromDiscover}
      />

      <CuratedDebatesSection
        debates={curatedDebates.curatedArenaDebates}
        loading={curatedDebates.arenaDebatesLoading}
        error={curatedDebates.arenaDebatesError}
        onOpenDebate={(debateId) => navigate(`/arena/${debateId}`)}
      />

      <RecommendedGroupsSection
        groups={recommendedGroups.groups}
        loading={recommendedGroups.groupsLoading}
        error={recommendedGroups.groupsError}
        actionLoadingId={recommendedGroups.groupActionLoading}
        getActionLabel={recommendedGroups.getGroupActionLabel}
        onAction={(group) => void recommendedGroups.handleGroupAction(group)}
        onOpenGroup={(groupId) => navigate(`/group/${groupId}`)}
      />

      <PublicationFeedSection
        feed={publicationFeed}
        isPostLiked={isPostLiked}
        isPostSaved={isPostSaved}
        onToggleLike={toggleLikePost}
        onToggleSave={toggleSavePost}
        onOpenPublication={openPublicationFromDiscover}
        onOpenComments={openPublicationComments}
      />

      {activeYouTubePublication && (
        <YouTubePlayerModal publication={activeYouTubePublication} onClose={closeYouTubePlayer} />
      )}
    </div>
  );
};

export default DiscoverPage;
