import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { useAppState } from '@/context/app-state';
import { getGroups } from '@/features/groups/api';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';
import { useToast } from '@/shared/ui/Toast';
import { getCategoryHeadline } from '@/features/discover/model/categoryHeadline';
import {
  membersByCategory,
  selectCategories,
  type DiscoverFilters,
} from '@/features/discover/model/discoverCatalog';
import DiscoverSection, { SectionEmpty } from '@/features/discover/components/DiscoverSection';

type Props = {
  query: string;
  filters: DiscoverFilters;
};

const readOnboardingInterests = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('vinctus_interests') ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

/** "Intereses": every topic as a tile with its newest live item; opening one shows the category. */
export default function InterestsSection({ query, filters }: Props) {
  const { followedCategories } = useAppState();
  const groups = useSessionResource('discover:groups', getGroups);
  const [interests] = useState(readOnboardingInterests);
  const followed = useMemo(() => new Set(followedCategories), [followedCategories]);
  const members = useMemo(() => membersByCategory(groups.data ?? []), [groups.data]);
  const categories = useMemo(
    () =>
      selectCategories(CATEGORIES, {
        query,
        filters,
        followed,
        interests,
        membersByCategory: members,
      }),
    [query, filters, followed, interests, members],
  );

  return (
    <DiscoverSection title="Intereses" subtitle="Lo último de cada tema, en vivo.">
      {categories.length === 0 ? (
        <SectionEmpty>Ningún interés coincide con tu búsqueda.</SectionEmpty>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {categories.map((category) => (
            <InterestTile key={category.id} category={category} />
          ))}
        </div>
      )}
    </DiscoverSection>
  );
}

function InterestTile({ category }: { category: Category }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isCategoryFollowed, toggleFollowCategory } = useAppState();
  const headline = useSessionResource(
    `discover:headline:${category.id}`,
    () => getCategoryHeadline(category),
    15 * 60_000,
  );
  const followed = isCategoryFollowed(category.id);
  const Icon = category.icon;

  const toggleFollow = () => {
    toggleFollowCategory(category.id);
    showToast(
      followed ? `Dejaste de seguir ${category.label}` : `Sigues ${category.label}`,
      followed ? 'info' : 'success',
    );
  };

  return (
    <article className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-surface-overlay p-4 transition-colors duration-300 hover:border-white/[0.14] md:p-5">
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ${category.color}`}
        >
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={followed}
          aria-label={followed ? `Dejar de seguir ${category.label}` : `Seguir ${category.label}`}
          className={`relative z-10 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
            followed
              ? 'bg-brand-gold/15 text-brand-gold hover:bg-brand-gold/25'
              : 'border border-white/15 text-neutral-300 hover:border-white/30 hover:text-white'
          }`}
        >
          {followed ? <Check size={13} /> : <Plus size={13} />}
          <span className="hidden sm:inline">{followed ? 'Siguiendo' : 'Seguir'}</span>
        </button>
      </div>

      <h3 className="mt-4 font-display text-lg leading-tight text-white md:text-xl">
        <button
          type="button"
          onClick={() =>
            navigate(`/category/${category.id}`, {
              state: { fromDiscover: true, source: 'category-grid' },
            })
          }
          className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand-gold/60"
        >
          {category.label}
        </button>
      </h3>
      <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{category.description}</p>

      <div className="mt-auto pt-4">
        <div className="border-t border-white/[0.06] pt-3">
          {headline.data ? (
            <>
              <p className="truncate text-[11px] font-medium text-neutral-500">
                {headline.data.source}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-neutral-300">
                {headline.data.title}
              </p>
            </>
          ) : headline.data === null || headline.error ? (
            <p className="text-xs text-neutral-600">Sin novedades por ahora.</p>
          ) : (
            <div aria-hidden className="space-y-1.5">
              <div className="skeleton h-2.5 w-1/3" />
              <div className="skeleton h-2.5 w-5/6" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
