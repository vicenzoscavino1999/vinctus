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
        <p className="text-neutral-500 font-light text-sm text-center">
          Tu archivo personal de lecturas, recursos, música y más.
        </p>
      )}

      <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-lg px-5 py-3.5 flex items-center gap-3">
        <Search className="text-neutral-600 shrink-0" size={18} />
        <input
          type="text"
          aria-label="Buscar en colecciones"
          placeholder="Buscar en colecciones..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full bg-transparent text-white focus:outline-none placeholder:text-neutral-600 font-light"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Limpiar búsqueda"
            className="text-neutral-500 hover:text-white transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setEditorState({ open: true, collection: null })}
        className="w-full flex items-center justify-between bg-neutral-900/30 border border-neutral-800 rounded-lg px-5 py-4 hover:bg-neutral-900/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
            <FolderPlus size={18} />
          </div>
          <span className="text-neutral-300 font-light">+ Nueva carpeta</span>
        </div>
        <ArrowRight
          size={16}
          className="text-neutral-600 group-hover:text-neutral-400 transition-colors"
        />
      </button>

      <section>
        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">
          CARPETAS {searchQuery && `(${filteredCollections.length})`}
        </h2>
        {loadingCollections ? (
          <div className="text-sm text-neutral-500 text-center py-6">Cargando carpetas...</div>
        ) : collectionsError ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-red-400">{collectionsError}</p>
            <button
              type="button"
              onClick={() => void loadCollections()}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : filteredCollections.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-6">No se encontraron carpetas</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredCollections.map((collection) => {
              const icon = getCollectionIcon(collection.icon);
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(collection.id)}
                  className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 text-left hover:bg-neutral-900/50 hover:border-neutral-700 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-200 shrink-0">
                      <icon.Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium text-sm truncate">{collection.name}</h3>
                      <p className="text-neutral-500 text-xs mt-0.5">
                        {collection.itemCount === 1
                          ? '1 guardado'
                          : `${collection.itemCount} guardados`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">
          RECIENTES {searchQuery && `(${filteredRecents.length})`}
        </h2>
        {loadingRecents ? (
          <div className="text-sm text-neutral-500 text-center py-6">Cargando recientes...</div>
        ) : recentsError ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-red-400">{recentsError}</p>
            <button
              type="button"
              onClick={() => void loadRecents()}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : filteredRecents.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-6">
            No se encontraron elementos recientes
          </p>
        ) : (
          <div className="space-y-2">
            {filteredRecents.map((item) => {
              const isLink = item.type === 'link';
              const isFile = item.type === 'file';
              return (
                <button
                  key={`${item.collectionId}-${item.id}`}
                  type="button"
                  onClick={() => handleRecentClick(item)}
                  className="w-full text-left flex items-center gap-4 bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center flex-shrink-0 text-neutral-300">
                    {isLink ? (
                      <Link2 size={18} />
                    ) : isFile ? (
                      <File size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-light text-base truncate group-hover:text-white/90">
                      {item.title}
                    </h3>
                    <p className="text-neutral-500 text-xs mt-0.5">
                      Colección: {item.collectionName || 'Sin carpeta'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-500 text-xs flex-shrink-0">
                    <span>{formatRelativeTime(item.createdAt)}</span>
                    <ArrowRight
                      size={14}
                      className="text-neutral-600 group-hover:text-neutral-400 transition-colors"
                    />
                  </div>
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

      {selectedRecent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recent-note-title"
          className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset px-4"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedRecent(null)}
          />
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="recent-note-title" className="text-lg font-serif text-white">
                  {selectedRecent.title}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Colección: {selectedRecent.collectionName || 'Sin carpeta'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecent(null)}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="mt-4 text-sm text-neutral-300 whitespace-pre-wrap break-words">
              {selectedRecent.text || 'Sin contenido.'}
            </div>
            <div className="mt-5 text-xs text-neutral-500">
              {formatRelativeTime(selectedRecent.createdAt)}
            </div>
          </div>
        </div>
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
