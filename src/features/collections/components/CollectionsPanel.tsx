import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, File, FileText, FolderPlus, Link2, Search } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
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

const formatRelativeTime = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Ahora';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Hace ${months} mes`;
  const years = Math.floor(months / 12);
  return `Hace ${years} a`;
};

const CollectionsPanel = ({ showIntro = true }: CollectionsPanelProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<CollectionRead[]>([]);
  const [recents, setRecents] = useState<CollectionItemRead[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<CollectionRead | null>(null);
  const [selectedRecent, setSelectedRecent] = useState<CollectionItemRead | null>(null);

  const loadCollections = async () => {
    if (!user) return;
    try {
      setCollectionsError(null);
      setLoadingCollections(true);
      const data = await getUserCollections(user.uid);
      setCollections(data);
    } catch (error) {
      console.error('Error loading collections:', error);
      setCollectionsError('No se pudieron cargar carpetas.');
    } finally {
      setLoadingCollections(false);
    }
  };

  const loadRecents = async () => {
    if (!user) return;
    try {
      setRecentsError(null);
      setLoadingRecents(true);
      const data = await getRecentCollectionItems(user.uid, 6);
      setRecents(data);
    } catch (error) {
      console.error('Error loading recents:', error);
      setRecentsError('No se pudieron cargar recientes.');
    } finally {
      setLoadingRecents(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setCollections([]);
      setRecents([]);
      return;
    }
    loadCollections();
    loadRecents();
  }, [user]);

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((collection) => collection.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  const filteredRecents = useMemo(() => {
    if (!searchQuery.trim()) return recents;
    const query = searchQuery.toLowerCase();
    return recents.filter((item) => {
      return (
        item.title.toLowerCase().includes(query) ||
        (item.collectionName || '').toLowerCase().includes(query)
      );
    });
  }, [recents, searchQuery]);

  const openExternal = (url: string | null, label: string) => {
    if (!url) {
      showToast(`${label} no disponible.`, 'info');
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        showToast('Enlace invalido.', 'info');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      showToast('Enlace invalido.', 'info');
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

  if (!user) {
    return (
      <div className="text-center text-neutral-500 text-sm py-12">
        Inicia sesion para ver tus colecciones.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showIntro && (
        <p className="text-neutral-500 font-light text-sm text-center">
          Tu archivo personal de lecturas, recursos, musica y mas.
        </p>
      )}

      <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-lg px-5 py-3.5">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
        <input
          type="text"
          aria-label="Buscar en colecciones"
          placeholder="Buscar en colecciones..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full bg-transparent text-white pl-8 focus:outline-none placeholder:text-neutral-600 font-light"
        />
      </div>

      <button
        onClick={() => setIsCreateOpen(true)}
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
          <div className="text-sm text-red-400 text-center py-6">{collectionsError}</div>
        ) : filteredCollections.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-6">No se encontraron carpetas</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredCollections.map((collection) => {
              const icon = getCollectionIcon(collection.icon);
              return (
                <button
                  key={collection.id}
                  onClick={() => setSelectedCollection(collection)}
                  className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 text-left hover:bg-neutral-900/50 hover:border-neutral-700 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-200">
                      <icon.Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium text-sm truncate">{collection.name}</h3>
                      <p className="text-neutral-500 text-xs mt-0.5">
                        {collection.itemCount} guardados
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
          <div className="text-sm text-red-400 text-center py-6">{recentsError}</div>
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
                  key={item.id}
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
                      Coleccion: {item.collectionName || 'Sin carpeta'}
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
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          setIsCreateOpen(false);
          loadCollections();
          loadRecents();
        }}
      />
      <CollectionDetailModal
        isOpen={!!selectedCollection}
        collection={selectedCollection}
        onClose={() => setSelectedCollection(null)}
        onItemCreated={() => {
          loadCollections();
          loadRecents();
        }}
        onItemDeleted={() => {
          loadCollections();
          loadRecents();
        }}
      />

      {selectedRecent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedRecent(null)}
          />
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-serif text-white">{selectedRecent.title}</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Coleccion: {selectedRecent.collectionName || 'Sin carpeta'}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecent(null)}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="mt-4 text-sm text-neutral-300 whitespace-pre-wrap">
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

export default CollectionsPanel;
