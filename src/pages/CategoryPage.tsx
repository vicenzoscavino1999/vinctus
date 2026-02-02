import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Hash,
  ArrowRight,
  Feather,
  FileText,
  Link as LinkIcon,
  Loader2,
} from 'lucide-react';
import {
  ApiContentCard,
  SkeletonContentGrid,
  EmptyState,
  ErrorState,
  useToast,
} from '../components';
import { useApiContent } from '../hooks';
import { CATEGORIES } from '../data';
import {
  getContributionsByCategory,
  getGroupsByCategory,
  getUserProfile,
  type ContributionRead,
  type ContributionType,
  type FirestoreGroup,
} from '../lib/firestore';

type ContributionLibraryItem = ContributionRead & {
  authorName: string;
  authorPhoto: string | null;
};

const CONTRIBUTION_LABELS: Record<ContributionType, string> = {
  project: 'Proyecto',
  paper: 'Paper',
  cv: 'CV',
  certificate: 'Certificado',
  other: 'Otro',
};

const formatMembers = (value: number): string => {
  return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
};

const CategoryPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('live');
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const { showToast } = useToast();

  const category = CATEGORIES.find((c) => c.id === categoryId);
  const selectedSubgroup =
    category?.subgroups.find((subgroup) => subgroup.id === selectedSubgroupId) || null;
  const activeSubgroupId = selectedSubgroup?.id || category?.subgroups[0]?.id || null;

  const [communityGroups, setCommunityGroups] = useState<FirestoreGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [libraryItems, setLibraryItems] = useState<ContributionLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // Get API query from selected subgroup or default to first one
  const apiQuery =
    viewMode === 'live'
      ? selectedSubgroup?.apiQuery || category?.subgroups[0]?.apiQuery || category?.id || null
      : null;
  const apiSource = viewMode === 'live' ? category?.apiSource || null : null;

  // Fetch live content from API with toast notifications
  const { data: liveContent, loading, error } = useApiContent(apiSource, apiQuery, 8, showToast);

  useEffect(() => {
    if (!category?.id) return;
    let active = true;
    const loadGroups = async () => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const items = await getGroupsByCategory(category.id);
        if (!active) return;
        setCommunityGroups(items);
      } catch (loadError) {
        console.error('Error loading category groups:', loadError);
        if (!active) return;
        setGroupsError('No se pudieron cargar las comunidades.');
      } finally {
        if (active) setGroupsLoading(false);
      }
    };
    void loadGroups();
    return () => {
      active = false;
    };
  }, [category?.id]);

  useEffect(() => {
    if (!category?.id) return;
    let active = true;
    const loadLibrary = async () => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const contributions = await getContributionsByCategory(category.id, 16);
        const uniqueAuthors = Array.from(new Set(contributions.map((item) => item.userId)));
        const profiles = await Promise.all(
          uniqueAuthors.map(async (uid) => {
            try {
              const profile = await getUserProfile(uid);
              return { uid, profile };
            } catch {
              return { uid, profile: null };
            }
          }),
        );
        const profileMap = new Map(profiles.map(({ uid, profile }) => [uid, profile]));
        const items: ContributionLibraryItem[] = contributions.map((item) => {
          const profile = profileMap.get(item.userId);
          return {
            ...item,
            authorName: profile?.displayName ?? profile?.username ?? 'Usuario',
            authorPhoto: profile?.photoURL ?? null,
          };
        });
        if (!active) return;
        setLibraryItems(items);
      } catch (loadError) {
        console.error('Error loading library contributions:', loadError);
        if (!active) return;
        setLibraryError('No se pudo cargar la biblioteca.');
      } finally {
        if (active) setLibraryLoading(false);
      }
    };
    void loadLibrary();
    return () => {
      active = false;
    };
  }, [category?.id]);

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

  return (
    <div className="page-category">
      <button
        onClick={() => navigate('/discover')}
        className="group flex items-center text-neutral-500 hover:text-neutral-300 mb-8 transition-colors text-xs tracking-widest uppercase"
      >
        <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" />
        Regresar
      </button>

      <header className="mb-12 border-b border-neutral-900 pb-12">
        <div className={`inline-flex mb-6 opacity-80 ${category.color}`}>
          <category.icon size={40} strokeWidth={0.5} />
        </div>

        <div className="flex justify-between items-end mb-6">
          <h1 className="text-5xl md:text-7xl font-serif font-light text-white tracking-tight">
            {category.label}
          </h1>
        </div>

        <p className="text-neutral-400 text-lg md:text-xl max-w-2xl font-light font-sans leading-relaxed mb-8">
          {category.description}
        </p>

        {/* Tab navigation */}
        <div className="flex space-x-8 text-sm tracking-widest uppercase">
          <button
            onClick={() => setViewMode('live')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'live' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            En Vivo
          </button>
          <button
            onClick={() => setViewMode('subgroups')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'subgroups' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            Comunidades
          </button>
          <button
            onClick={() => setViewMode('library')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'library' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            Biblioteca
          </button>
        </div>
      </header>

      {/* Live content from API */}
      {viewMode === 'live' && (
        <div className="animate-in fade-in duration-500">
          {/* Subgroup filter buttons */}
          <div className="flex flex-wrap gap-2 mb-8">
            {category.subgroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedSubgroupId(group.id)}
                className={`text-xs px-4 py-2 rounded-full border transition-colors ${
                  activeSubgroupId === group.id
                    ? 'bg-white text-black border-white'
                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          {/* Loading state - Premium skeleton */}
          {loading && <SkeletonContentGrid count={4} />}

          {/* Error state - Premium */}
          {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}

          {/* Content grid */}
          {!loading && !error && liveContent.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-premium">
              {liveContent.map((item, idx) => (
                <ApiContentCard key={item.id || idx} item={item} type={category.apiSource} />
              ))}
            </div>
          )}

          {/* Empty state - Premium */}
          {!loading && !error && liveContent.length === 0 && (
            <EmptyState
              icon={Feather}
              title="Sin contenido disponible"
              message="No hay publicaciones en esta categoría aún. ¡Vuelve pronto!"
            />
          )}
        </div>
      )}

      {/* Subgroups view */}
      {viewMode === 'subgroups' && (
        <div className="animate-in fade-in duration-500">
          {groupsLoading ? (
            <div className="py-16 text-center text-neutral-500">
              <Loader2 size={20} className="mx-auto mb-3 animate-spin" />
              Cargando comunidades...
            </div>
          ) : groupsError ? (
            <div className="py-16 text-center text-red-400">{groupsError}</div>
          ) : communityGroups.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
              <p className="text-neutral-500">Aun no hay comunidades en esta categoria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-900 border border-neutral-900">
              {communityGroups.map((group) => {
                const membersLabel =
                  typeof group.memberCount === 'number'
                    ? `${formatMembers(group.memberCount)} miembros`
                    : 'Miembros';
                return (
                  <div
                    key={group.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/group/${group.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/group/${group.id}`);
                      }
                    }}
                    className="bg-neutral-950 p-10 hover:bg-neutral-900/40 transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-8">
                      <Hash
                        size={16}
                        className="text-neutral-700 group-hover:text-neutral-500 transition-colors"
                      />
                    </div>
                    <h3 className="text-xl text-neutral-200 font-serif font-light mb-2">
                      {group.name}
                    </h3>
                    <p className="text-neutral-600 text-xs tracking-wider uppercase mb-8">
                      {membersLabel}
                    </p>
                    <div className="flex items-center text-neutral-500 text-xs group-hover:text-white transition-colors">
                      <span>Explorar</span>
                      <ArrowRight size={12} className="ml-2" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Library view */}
      {viewMode === 'library' && (
        <div className="animate-in fade-in duration-500">
          {libraryLoading ? (
            <div className="py-16 text-center text-neutral-500">
              <Loader2 size={20} className="mx-auto mb-3 animate-spin" />
              Cargando biblioteca...
            </div>
          ) : libraryError ? (
            <div className="py-16 text-center text-red-400">{libraryError}</div>
          ) : libraryItems.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-neutral-800 rounded-lg">
              <p className="text-neutral-500 font-light italic">
                No hay documentos archivados en esta categoría aún.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl">
              {libraryItems.map((item) => (
                <div
                  key={item.id}
                  className="p-5 border border-neutral-800/80 rounded-2xl bg-neutral-900/20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500 uppercase tracking-wider">
                      {CONTRIBUTION_LABELS[item.type]}
                    </span>
                    <span className="text-xs text-neutral-600">{item.authorName}</span>
                  </div>
                  <h3 className="text-lg text-white font-medium mb-2">{item.title}</h3>
                  {item.description && (
                    <p className="text-sm text-neutral-400 mb-3">{item.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 text-neutral-200 text-xs hover:bg-neutral-700 transition-colors"
                      >
                        <LinkIcon size={14} />
                        Ver enlace
                      </a>
                    )}
                    {item.fileUrl && (
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 text-neutral-200 text-xs hover:bg-neutral-700 transition-colors"
                      >
                        <FileText size={14} />
                        {item.fileName || 'Ver PDF'}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryPage;
