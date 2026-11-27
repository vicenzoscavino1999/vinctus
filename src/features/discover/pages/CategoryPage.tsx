import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Feather,
  FileText,
  FolderGit2,
  GraduationCap,
  Link as LinkIcon,
  Lock,
  Plus,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { SkeletonContentGrid, EmptyState, ErrorState } from '@/shared/ui/SkeletonLoader';
import { useToast } from '@/shared/ui/Toast';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth';
import ApiContentCard from '@/features/discover/components/ApiContentCard';
import { SectionEmpty, SectionError } from '@/features/discover/components/DiscoverSection';
import {
  useCategoryGroups,
  useCategoryLibrary,
} from '@/features/discover/hooks/useCategoryContent';
import { countLabel } from '@/features/discover/model/discoverCatalog';
import { useApiContent } from '@/shared/hooks';
import { CATEGORIES } from '@/shared/constants';
import type { ContributionType } from '@/features/profile/api';

const isSafeHttpUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

type CategoryNavigationState = {
  enteredAt?: number;
  fromDiscover?: boolean;
  source?: string;
};

type ViewMode = 'live' | 'subgroups' | 'library';

const TABS: Array<{ id: ViewMode; label: string }> = [
  { id: 'live', label: 'En vivo' },
  { id: 'subgroups', label: 'Comunidades' },
  { id: 'library', label: 'Biblioteca' },
];

const CONTRIBUTIONS: Record<ContributionType, { label: string; icon: LucideIcon }> = {
  project: { label: 'Proyecto', icon: FolderGit2 },
  paper: { label: 'Paper', icon: ScrollText },
  cv: { label: 'CV', icon: GraduationCap },
  certificate: { label: 'Certificado', icon: Award },
  other: { label: 'Otro', icon: FileText },
};

const ListSkeleton = () => (
  <div aria-hidden className="space-y-3">
    {[0, 1, 2].map((index) => (
      <div key={index} className="skeleton h-[92px] rounded-2xl" />
    ))}
  </div>
);

/**
 * `/category/:categoryId`: the interest with its live content, its communities and its library.
 * Communities and library load the first time their tab opens and stay for the session.
 */
const CategoryPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { toggleFollowCategory, isCategoryFollowed } = useAppState();
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [subgroupSelection, setSubgroupSelection] = useState<{
    categoryId: string;
    subgroupId: string;
  } | null>(null);
  const navigationState = (location.state as CategoryNavigationState | null) ?? null;
  const cameFromDiscover = navigationState?.fromDiscover === true;

  const category = CATEGORIES.find((c) => c.id === categoryId);
  const selectedSubgroup =
    category?.subgroups.find(
      (subgroup) =>
        subgroupSelection?.categoryId === category.id &&
        subgroup.id === subgroupSelection.subgroupId,
    ) || null;
  const activeSubgroupId = selectedSubgroup?.id || category?.subgroups[0]?.id || null;

  const apiQuery =
    viewMode === 'live'
      ? selectedSubgroup?.apiQuery || category?.subgroups[0]?.apiQuery || category?.id || null
      : null;
  const apiSource = viewMode === 'live' ? category?.apiSource || null : null;
  const live = useApiContent(apiSource, apiQuery, 8, showToast);
  const groups = useCategoryGroups(category?.id ?? null, viewMode === 'subgroups');
  const library = useCategoryLibrary(
    category?.id ?? null,
    user?.uid ?? null,
    viewMode === 'library',
  );

  const handleBack = () => {
    if (cameFromDiscover && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/discover');
  };

  if (!category) {
    return (
      <div className="py-20 text-center">
        <p className="text-neutral-500">Categoría no encontrada</p>
        <button onClick={() => navigate('/discover')} className="mt-4 text-white underline">
          Volver
        </button>
      </div>
    );
  }

  const followed = isCategoryFollowed(category.id);
  const toggleFollow = () => {
    toggleFollowCategory(category.id);
    showToast(
      followed ? 'Dejaste de seguir esta categoría' : 'Ahora sigues esta categoría',
      followed ? 'info' : 'success',
    );
  };

  return (
    <div
      className={`page-category mx-auto max-w-5xl pb-24 ${
        cameFromDiscover
          ? 'animate-in fade-in slide-in-from-right-3 duration-500'
          : 'animate-in fade-in duration-300'
      }`}
    >
      <button
        type="button"
        onClick={handleBack}
        className="-ml-1 mb-6 mt-2 inline-flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        <ChevronLeft size={18} />
        Descubrir
      </button>

      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <category.icon size={26} strokeWidth={1.4} className={category.color} />
            </span>
            <h1 className="font-display text-display-sm text-white md:text-display-md">
              {category.label}
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleFollow}
            aria-pressed={followed}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
              followed
                ? 'border border-white/[0.12] text-neutral-200 hover:border-white/25'
                : 'bg-brand-gold text-black hover:bg-amber-400'
            }`}
          >
            {followed ? <Check size={15} /> : <Plus size={15} />}
            {followed ? 'Siguiendo' : 'Seguir'}
          </button>
        </div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-400">
          {category.description}
        </p>

        <div className="mt-6 inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewMode(tab.id)}
              aria-pressed={viewMode === tab.id}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                viewMode === tab.id
                  ? 'bg-white font-medium text-black'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {viewMode === 'live' && (
        <section className="animate-in fade-in duration-300">
          <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {category.subgroups.map((subgroup) => (
              <button
                key={subgroup.id}
                type="button"
                onClick={() =>
                  setSubgroupSelection({ categoryId: category.id, subgroupId: subgroup.id })
                }
                aria-pressed={activeSubgroupId === subgroup.id}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  activeSubgroupId === subgroup.id
                    ? 'border-white bg-white text-black'
                    : 'border-white/[0.1] text-neutral-400 hover:border-white/25 hover:text-white'
                }`}
              >
                {subgroup.name}
              </button>
            ))}
          </div>

          {live.loading && <SkeletonContentGrid count={4} />}
          {!live.loading && live.error && (
            <ErrorState
              message="No se pudo cargar el contenido en vivo. Revisa tu conexión e intenta de nuevo."
              onRetry={live.retry}
            />
          )}
          {!live.loading && !live.error && live.data.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 stagger-premium">
              {live.data.map((item, index) => (
                <ApiContentCard key={item.id || index} item={item} type={category.apiSource} />
              ))}
            </div>
          )}
          {!live.loading && !live.error && live.data.length === 0 && (
            <EmptyState
              icon={Feather}
              title="Sin contenido disponible"
              message="No hay publicaciones en esta categoría aún. ¡Vuelve pronto!"
            />
          )}
        </section>
      )}

      {viewMode === 'subgroups' && (
        <section className="animate-in fade-in duration-300">
          {groups.error && !groups.data ? (
            <SectionError
              message="No se pudieron cargar las comunidades."
              onRetry={groups.reload}
            />
          ) : !groups.data ? (
            <ListSkeleton />
          ) : groups.data.length === 0 ? (
            <SectionEmpty>Aún no hay comunidades en esta categoría.</SectionEmpty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {groups.data.map((group) => {
                const isPrivate = (group.visibility ?? 'public') !== 'public';
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="flex items-start gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay p-4 text-left transition-colors hover:border-white/[0.14]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900">
                      {group.iconUrl ? (
                        <img
                          src={group.iconUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Users size={20} className="text-neutral-500" strokeWidth={1.6} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-white">
                        {group.name}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-neutral-500">
                        {group.description || 'Sin descripción.'}
                      </span>
                      <span className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
                        {countLabel(group.memberCount ?? 0, 'miembro', 'miembros')}
                        {isPrivate && (
                          <>
                            <span aria-hidden>·</span>
                            <Lock size={11} /> Privado
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-neutral-600" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {viewMode === 'library' && (
        <section className="animate-in fade-in duration-300">
          {library.error && !library.data ? (
            <SectionError message="No se pudo cargar la biblioteca." onRetry={library.reload} />
          ) : !library.data ? (
            <ListSkeleton />
          ) : library.data.length === 0 ? (
            <SectionEmpty>No hay documentos archivados en esta categoría aún.</SectionEmpty>
          ) : (
            <div className="max-w-3xl space-y-3">
              {library.data.map((item) => {
                const kind = CONTRIBUTIONS[item.type] ?? CONTRIBUTIONS.other;
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-white/[0.06] bg-surface-overlay p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-gold">
                        <kind.icon size={13} />
                        {kind.label}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
                        {item.authorPhoto ? (
                          <img
                            src={item.authorPhoto}
                            alt=""
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[10px] text-neutral-300">
                            {item.authorName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{item.authorName}</span>
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-lg text-white">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                        {item.description}
                      </p>
                    )}
                    {(isSafeHttpUrl(item.link) || isSafeHttpUrl(item.fileUrl)) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isSafeHttpUrl(item.link) && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-white/25"
                          >
                            <LinkIcon size={13} />
                            Ver enlace
                          </a>
                        )}
                        {isSafeHttpUrl(item.fileUrl) && (
                          <a
                            href={item.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-white/25"
                          >
                            <FileText size={13} />
                            {item.fileName || 'Ver PDF'}
                          </a>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CategoryPage;
