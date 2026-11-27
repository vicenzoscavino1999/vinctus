import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { ArrowRight, File, FileText, FolderPlus, Link2, Search, X } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  getRecentCollectionItems,
  getUserCollections,
  type CollectionItemRead,
  type CollectionRead,
} from '@/features/collections/api';
import { useToast } from '@/shared/ui/Toast';
import { getCollectionIcon } from './collectionIcons';
import CreateCollectionModal from './CreateCollectionModal';
import CollectionDetailModal from './CollectionDetailModal';

interface CollectionsPanelProps {
  showIntro?: boolean;
}

const normalizeSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const CollectionsSession = ({ userId, showIntro }: { userId: string; showIntro: boolean }) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<CollectionRead[]>([]);
  const [recents, setRecents] = useState<CollectionItemRead[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingRecents, setLoadingRecents] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    collection: CollectionRead | null;
  }>({ open: false, collection: null });
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedRecent, setSelectedRecent] = useState<CollectionItemRead | null>(null);
  const collectionsSeqRef = useRef(0);
  const recentsSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadCollections = useCallback(async () => {
    const seq = ++collectionsSeqRef.current;
    try {
      setCollectionsError(null);
      setLoadingCollections(true);
      const data = await getUserCollections(userId);
      if (!isMountedRef.current || collectionsSeqRef.current !== seq) return;
      setCollections(data);
    } catch (error) {
      console.error('Error loading collections:', error);
      if (!isMountedRef.current || collectionsSeqRef.current !== seq) return;
      setCollectionsError('No se pudieron cargar carpetas.');
    } finally {
      if (isMountedRef.current && collectionsSeqRef.current === seq) {
        setLoadingCollections(false);
      }
    }
  }, [userId]);

  const loadRecents = useCallback(async () => {
    const seq = ++recentsSeqRef.current;
    try {
      setRecentsError(null);
      setLoadingRecents(true);
      const data = await getRecentCollectionItems(userId, 6);
      if (!isMountedRef.current || recentsSeqRef.current !== seq) return;
      setRecents(data);
    } catch (error) {
      console.error('Error loading recents:', error);
      if (!isMountedRef.current || recentsSeqRef.current !== seq) return;
      setRecentsError('No se pudieron cargar recientes.');
    } finally {
      if (isMountedRef.current && recentsSeqRef.current === seq) {
        setLoadingRecents(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void loadCollections();
    void loadRecents();
  }, [loadCollections, loadRecents]);

  useEffect(() => {
    if (!selectedRecent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedRecent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRecent]);

  const selectedCollection = useMemo(
    () =>
      selectedCollectionId
        ? (collections.find((collection) => collection.id === selectedCollectionId) ?? null)
        : null,
    [collections, selectedCollectionId],
  );

  const normalizedQuery = normalizeSearch(searchQuery.trim());

  const filteredCollections = useMemo(() => {
    if (!normalizedQuery) return collections;
    return collections.filter((collection) =>
      normalizeSearch(collection.name).includes(normalizedQuery),
    );
  }, [collections, normalizedQuery]);

  const filteredRecents = useMemo(() => {
    if (!normalizedQuery) return recents;
    return recents.filter((item) => {
      return (
        normalizeSearch(item.title).includes(normalizedQuery) ||
        normalizeSearch(item.collectionName || '').includes(normalizedQuery)
      );
    });
  }, [recents, normalizedQuery]);

  const openExternal = (url: string | null, label: string) => {
    if (!url) {
      showToast(`${label} no disponible.`, 'info');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        showToast('Enlace inválido.', 'info');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      showToast('Enlace inválido.', 'info');
    }
  };

  const handleRecentClick = (item: CollectionItemRead) => {
    if (item.type === 'note') {
      setSelectedRecent(item);
      return;
    }
    if (item.type === 'link') {
      openExternal(item.url, 'Enlace');
      return;
    }
    if (item.type === 'file') {
      openExternal(item.url, 'Archivo');
      return;
    }
    showToast('Vista del elemento disponible pronto', 'info');
  };

  return (
    <div className="space-y-8">
      {showIntro && (
        <p className="text-sm text-neutral-500">
          Tu archivo personal de lecturas, recursos, música y más. Solo tú puedes verlo.
        </p>
      )}

      <label className="flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 focus-within:border-white/20">
        <Search className="shrink-0 text-neutral-500" size={17} />
        <input
          type="text"
          aria-label="Buscar en colecciones"
          placeholder="Buscar en colecciones"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="h-11 w-full bg-transparent text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Limpiar búsqueda"
            className="shrink-0 text-neutral-500 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </label>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">
            Carpetas
            {searchQuery && (
              <span className="ml-1.5 font-normal text-neutral-500">
                ({filteredCollections.length})
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => setEditorState({ open: true, collection: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-gold px-4 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            <FolderPlus size={15} />+ Nueva carpeta
          </button>
        </div>
        {loadingCollections ? (
          <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-[84px] rounded-2xl" />
            ))}
          </div>
        ) : collectionsError ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-red-400">{collectionsError}</p>
            <button
              type="button"
              onClick={() => void loadCollections()}
              className="rounded-full border border-white/[0.12] px-4 py-1.5 text-xs text-neutral-200 transition-colors hover:border-white/25 hover:text-white"
            >
              Reintentar
            </button>
          </div>
        ) : filteredCollections.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.08] py-8 text-center text-sm text-neutral-500">
            {searchQuery
              ? 'No se encontraron carpetas'
              : 'Crea tu primera carpeta para guardar enlaces, notas y archivos.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {filteredCollections.map((collection) => {
              const icon = getCollectionIcon(collection.icon);
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(collection.id)}
                  className="rounded-2xl border border-white/[0.06] bg-surface-overlay p-4 text-left transition-colors hover:border-white/[0.14]"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold">
                    <icon.Icon size={18} />
                  </span>
                  <span className="block truncate text-[15px] font-semibold text-white">
                    {collection.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {collection.itemCount === 1
                      ? '1 guardado'
                      : `${collection.itemCount} guardados`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">
          Recientes
          {searchQuery && (
            <span className="ml-1.5 font-normal text-neutral-500">({filteredRecents.length})</span>
          )}
        </h2>
        {loadingRecents ? (
          <div aria-hidden className="space-y-2.5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-[68px] rounded-2xl" />
            ))}
          </div>
        ) : recentsError ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-red-400">{recentsError}</p>
            <button
              type="button"
              onClick={() => void loadRecents()}
              className="rounded-full border border-white/[0.12] px-4 py-1.5 text-xs text-neutral-200 transition-colors hover:border-white/25 hover:text-white"
            >
              Reintentar
            </button>
          </div>
        ) : filteredRecents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.08] py-8 text-center text-sm text-neutral-500">
            No se encontraron elementos recientes
          </p>
        ) : (
          <div className="space-y-2.5">
            {filteredRecents.map((item) => {
              const isLink = item.type === 'link';
              const isFile = item.type === 'file';
              return (
                <button
                  key={`${item.collectionId}-${item.id}`}
                  type="button"
                  onClick={() => handleRecentClick(item)}
                  className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay p-3.5 text-left transition-colors hover:border-white/[0.14]"
                >
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-neutral-300">
                    {isLink ? (
                      <Link2 size={18} />
                    ) : isFile ? (
                      <File size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-white">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      Colección: {item.collectionName || 'Sin carpeta'}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-1.5 text-xs text-neutral-500">
                    {formatRelativeTime(item.createdAt)}
                    <ArrowRight
                      size={14}
                      className="text-neutral-600 transition-colors group-hover:text-neutral-400"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <CreateCollectionModal
        isOpen={editorState.open}
        initialCollection={editorState.collection}
        onClose={() => setEditorState({ open: false, collection: null })}
        onSaved={() => {
          setEditorState({ open: false, collection: null });
          void loadCollections();
          void loadRecents();
        }}
      />
      <CollectionDetailModal
        isOpen={Boolean(selectedCollection) && !editorState.open}
        collection={selectedCollection}
        onClose={() => setSelectedCollectionId(null)}
        onEditCollection={(collection) => {
          setEditorState({ open: true, collection });
        }}
        onCollectionDeleted={(collectionId) => {
          setSelectedCollectionId(null);
          setCollections((prev) => prev.filter((item) => item.id !== collectionId));
          setRecents((prev) => prev.filter((item) => item.collectionId !== collectionId));
          void loadCollections();
          void loadRecents();
        }}
        onItemCreated={() => {
          void loadCollections();
          void loadRecents();
        }}
        onItemDeleted={() => {
          void loadCollections();
          void loadRecents();
        }}
      />

      {selectedRecent &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recent-note-title"
            className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedRecent(null)}
            />
            <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl">
              <div className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 id="recent-note-title" className="font-display text-2xl text-white">
                    {selectedRecent.title}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Colección: {selectedRecent.collectionName || 'Sin carpeta'} ·{' '}
                    {formatRelativeTime(selectedRecent.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecent(null)}
                  className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-200">
                {selectedRecent.text || 'Sin contenido.'}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

const CollectionsPanel = ({ showIntro = true }: CollectionsPanelProps) => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="text-center text-neutral-500 text-sm py-12">
        Inicia sesión para ver tus colecciones.
      </div>
    );
  }

  return <CollectionsSession key={user.uid} userId={user.uid} showIntro={showIntro} />;
};

export default CollectionsPanel;
