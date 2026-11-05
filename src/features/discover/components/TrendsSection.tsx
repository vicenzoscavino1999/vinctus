import type { Category } from '@/shared/types';
import TrendCard from '@/features/discover/components/TrendCard';
import TrendPreviewPanel from '@/features/discover/components/TrendPreviewPanel';
import type { TrendCategories } from '@/features/discover/hooks/useTrendCategories';

type TrendsSectionProps = {
  trends: TrendCategories;
  isCategorySaved: (categoryId: string) => boolean;
  isCategoryFollowed: (categoryId: string) => boolean;
  onToggleFollow: (category: Category) => void;
  onToggleSave: (category: Category) => void;
  onOpenCategory: (categoryId: string, source: 'trend-card' | 'trend-preview') => void;
};

/** "Tendencias esta semana": a featured card and three compact ones (a carousel on mobile). */
const TrendsSection = ({
  trends,
  isCategorySaved,
  isCategoryFollowed,
  onToggleFollow,
  onToggleSave,
  onOpenCategory,
}: TrendsSectionProps) => {
  const {
    trendCards,
    featuredTrendCategory,
    secondaryTrendCategories,
    activeTrendCategory,
    activeTrendPreview,
    activateTrendCategory,
    getTrendSignals,
    trendRankPositionByCategory,
    trendScoresByCategory,
  } = trends;

  const renderTrendCard = (
    category: Category,
    variant: 'featured' | 'compact',
    rankIndex: number,
  ) => (
    <TrendCard
      category={category}
      variant={variant}
      rankIndex={rankIndex}
      rankPosition={trendRankPositionByCategory[category.id] ?? rankIndex + 1}
      trendScore={Math.round((trendScoresByCategory[category.id]?.score ?? 0) * 100)}
      signals={getTrendSignals(category.id)}
      isActive={activeTrendCategory?.id === category.id}
      isSaved={isCategorySaved(category.id)}
      isFollowed={isCategoryFollowed(category.id)}
      onActivate={activateTrendCategory}
      onToggleFollow={onToggleFollow}
      onToggleSave={onToggleSave}
      onOpen={(target) => onOpenCategory(target.id, 'trend-card')}
    />
  );

  const renderTrendPreviewPanel = (className?: string) => {
    if (!activeTrendCategory || !activeTrendPreview) return null;
    return (
      <TrendPreviewPanel
        category={activeTrendCategory}
        preview={activeTrendPreview}
        onOpenCategory={(target) => onOpenCategory(target.id, 'trend-preview')}
        className={className}
      />
    );
  };

  return (
    <section className="mb-12">
      <h2 className="text-heading-lg font-display font-normal text-white mb-6">
        <span className="text-brand-gold">Tendencias</span> esta semana
      </h2>

      {trendCards.length === 0 ? (
        <div className="text-neutral-500 text-sm border border-dashed border-neutral-800 rounded-card p-6 text-center">
          No hay categorias para mostrar con los filtros actuales.
        </div>
      ) : (
        <>
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-start stagger-premium">
            {featuredTrendCategory && (
              <div className="lg:col-span-8 space-y-4">
                {renderTrendCard(featuredTrendCategory, 'featured', 0)}
                {renderTrendPreviewPanel()}
              </div>
            )}
            <div className="lg:col-span-4 grid gap-4">
              {secondaryTrendCategories.map((category, index) => (
                <div key={category.id}>{renderTrendCard(category, 'compact', index + 1)}</div>
              ))}
            </div>
          </div>

          <div className="lg:hidden flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
            {trendCards.map((category, index) => (
              <div key={category.id} className="w-[320px] flex-shrink-0">
                {renderTrendCard(category, 'compact', index)}
              </div>
            ))}
          </div>

          {renderTrendPreviewPanel('mt-4 lg:hidden')}
        </>
      )}
    </section>
  );
};

export default TrendsSection;
