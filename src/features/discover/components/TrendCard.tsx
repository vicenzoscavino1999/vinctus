import { ArrowRight, BookOpen, UserPlus } from 'lucide-react';
import type { Category } from '@/shared/types';
import type { TrendSignals } from '@/features/discover/model/trendRanking';

type TrendCardProps = {
  category: Category;
  variant: 'featured' | 'compact';
  /** Position among the rendered cards; staggers the entrance animation. */
  rankIndex: number;
  rankPosition: number;
  /** 0-100. */
  trendScore: number;
  signals: TrendSignals;
  isActive: boolean;
  isSaved: boolean;
  isFollowed: boolean;
  onActivate: (category: Category) => void;
  onToggleFollow: (category: Category) => void;
  onToggleSave: (category: Category) => void;
  onOpen: (category: Category) => void;
};

const TrendCard = ({
  category,
  variant,
  rankIndex,
  rankPosition,
  trendScore,
  signals,
  isActive,
  isSaved,
  isFollowed,
  onActivate,
  onToggleFollow,
  onToggleSave,
  onOpen,
}: TrendCardProps) => {
  const isFeatured = variant === 'featured';
  const subgroupLimit = isFeatured ? 3 : 2;
  const titleClass = isFeatured ? 'text-[2.4rem]' : 'text-[1.85rem]';

  return (
    <article
      role="button"
      tabIndex={0}
      onMouseEnter={() => onActivate(category)}
      onFocus={() => onActivate(category)}
      onClick={() => onActivate(category)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(category);
        }
      }}
      style={{ animationDelay: `${Math.min(rankIndex, 5) * 80}ms` }}
      className={`group relative overflow-hidden rounded-card border bg-surface-overlay/90 p-5 transition-all duration-300 card-premium animate-in fade-in slide-in-from-bottom-2 ${
        isFeatured ? 'min-h-[320px] lg:min-h-[360px] lg:p-7' : 'min-h-[250px]'
      } ${
        isActive
          ? 'border-brand-gold/60 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_18px_42px_-18px_rgba(212,175,55,0.45)]'
          : 'border-neutral-800/70 hover:border-neutral-600'
      }`}
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-brand-gold/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10 flex h-full flex-col">
        <div
          className={`flex ${isFeatured ? 'items-start justify-between gap-3' : 'flex-col gap-3'}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className={`${category.color} mt-0.5`}>
              <category.icon size={isFeatured ? 30 : 24} strokeWidth={1.2} />
            </div>
            <div className="min-w-0">
              <h3 className={`${titleClass} text-white font-display leading-tight`}>
                {category.label}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-brand-gold/35 bg-brand-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand-gold">
                  Top {rankPosition}
                </span>
                <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300">
                  {trendScore} score
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1 line-clamp-2">{category.description}</p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 ${isFeatured ? 'shrink-0' : 'self-start flex-wrap'}`}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleFollow(category);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                isFollowed
                  ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                  : 'border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <UserPlus size={11} />
              {isFollowed ? 'Siguiendo' : 'Seguir'}
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSave(category);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                isSaved
                  ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                  : 'border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <BookOpen size={11} />
              {isSaved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-brand-gold">
            {signals.liveLabel}
          </span>
          <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-300">
            {signals.groupsLabel}
          </span>
          {isFeatured && (
            <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-400">
              {signals.weeklyLabel}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {category.subgroups.slice(0, subgroupLimit).map((subgroup) => (
            <span
              key={subgroup.id}
              className="text-[10px] uppercase tracking-wider text-neutral-400 bg-neutral-800/60 px-2.5 py-1 rounded"
            >
              {subgroup.name}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-5 flex items-center justify-between">
          {isFeatured ? (
            <span className="text-xs text-neutral-500">
              {isFollowed ? 'Recibiras novedades semanales' : 'Activa seguimiento para novedades'}
            </span>
          ) : (
            <span className="text-xs text-neutral-500">
              {isFollowed ? 'Siguiendo categoria' : 'Categoria en tendencia'}
            </span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(category);
            }}
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:text-white transition-colors"
          >
            Abrir
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </article>
  );
};

export default TrendCard;
