import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatBytes, formatRelativeTime } from '@/shared/lib/formatUtils';
import {
  LIMITS,
  STORAGE_CONTENT_TYPES,
  STORAGE_MAX_BYTES,
} from '@/shared/lib/firestore/firestoreContract';
import { ExternalLink, File, FileText, Link2, Pencil, Trash2, X } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  createCollectionItem,
  deleteCollection,
  deleteCollectionItem,
  getCollectionItems,
  type CollectionItemRead,
  type CollectionItemType,
  type CollectionRead,
} from '@/features/collections/api';
import { deleteCollectionFile, uploadCollectionFile } from '@/shared/lib/storage';
import { useToast } from '@/shared/ui/Toast';
import { getCollectionIcon } from './collectionIcons';

interface CollectionDetailModalProps {
  isOpen: boolean;
  collection: CollectionRead | null;
  onClose: () => void;
  onEditCollection?: (collection: CollectionRead) => void;
  onCollectionDeleted?: (collectionId: string) => void;
  onItemCreated?: () => void;
  onItemDeleted?: () => void;
}

// storage.rules take files smaller than this, so a file of exactly the limit is rejected too.
const MAX_COLLECTION_FILE_SIZE = STORAGE_MAX_BYTES.file;
const COLLECTION_FILE_TYPES = STORAGE_CONTENT_TYPES.collectionFile;
const COLLECTION_FILE_ACCEPT = COLLECTION_FILE_TYPES.join(',');

const isSafeHttpUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const createStableItemId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const CollectionDetailDialog = ({
  collection,
  onClose,
  onEditCollection,
  onCollectionDeleted,
  onItemCreated,
  onItemDeleted,
}: Omit<CollectionDetailModalProps, 'isOpen' | 'collection'> & { collection: CollectionRead }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<CollectionItemRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [itemType, setItemType] = useState<CollectionItemType>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);
  const isBusy = isSubmitting || isDeletingCollection || deletingItemId !== null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;
    const loadItems = async () => {
      try {
        setLoadError(null);
        setIsLoading(true);
        const data = await getCollectionItems(user.uid, collection.id, 50);
        if (isActive) {
          setItems(data);
        }
      } catch (err) {
        console.error('Error loading collection items:', err);
        if (isActive) {
          setLoadError('No se pudieron cargar los elementos.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadItems();

    return () => {
      isActive = false;
    };
  }, [collection.id, user, reloadToken]);

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  const handleTypeChange = (nextType: CollectionItemType) => {
    setItemType(nextType);
    setFormError(null);
    if (nextType !== 'link') setUrl('');
    if (nextType !== 'note') setText('');
    if (nextType !== 'file') {
      setFile(null);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!user) {
      setFormError('Debes iniciar sesión.');
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    const trimmedText = text.trim();

    if (!trimmedTitle) {
      setFormError('El título es obligatorio.');
      return;
    }
    if (trimmedTitle.length > LIMITS.collectionItems.titleMaxLength) {
      setFormError(
        `El título no puede superar ${LIMITS.collectionItems.titleMaxLength} caracteres.`,
      );
      return;
    }

    if (itemType === 'link') {
      if (!isSafeHttpUrl(trimmedUrl)) {
        setFormError('Ingresa un enlace http:// o https:// válido.');
        return;
      }
      if (trimmedUrl.length > LIMITS.collectionItems.urlMaxLength) {
        setFormError(
          `El enlace no puede superar ${LIMITS.collectionItems.urlMaxLength} caracteres.`,
        );
        return;
      }
    }

    if (itemType === 'note') {
      if (!trimmedText) {
        setFormError('Ingresa una nota.');
        return;
      }
      if (trimmedText.length > LIMITS.collectionItems.noteMaxLength) {
        setFormError(
          `La nota no puede superar ${LIMITS.collectionItems.noteMaxLength} caracteres.`,
        );
        return;
      }
    }

    if (itemType === 'file') {
      if (!file) {
        setFormError('Selecciona un archivo.');
        return;
      }
      if (!file.type || !COLLECTION_FILE_TYPES.includes(file.type)) {
        setFormError('Tipo de archivo no permitido.');
        return;
      }
      if (file.size <= 0) {
        setFormError('El archivo está vacío.');
        return;
      }
      if (file.size >= MAX_COLLECTION_FILE_SIZE) {
        setFormError(`El archivo supera ${MAX_COLLECTION_FILE_SIZE / (1024 * 1024)}MB.`);
        return;
      }
    }

    setIsSubmitting(true);
    let uploadedFile: {
      url: string;
      path: string;
      fileName: string;
      contentType: string;
      size: number;
    } | null = null;
    try {
      const stableItemId = createStableItemId();
      if (itemType === 'file' && file) {
        uploadedFile = await uploadCollectionFile(
          file,
          user.uid,
          collection.id,
          stableItemId,
          (progress) => {
            if (isMountedRef.current && progress.totalBytes > 0) {
              setUploadProgress(
                Math.round((progress.bytesTransferred / progress.totalBytes) * 100),
              );
            }
          },
        );
      }

      await createCollectionItem(user.uid, collection.id, {
        itemId: stableItemId,
        collectionName: collection.name,
        type: itemType,
        title: trimmedTitle,
        url: itemType === 'link' ? trimmedUrl : (uploadedFile?.url ?? null),
        text: itemType === 'note' ? trimmedText : null,
        fileName: itemType === 'file' ? (uploadedFile?.fileName.slice(0, 200) ?? null) : null,
        fileSize: itemType === 'file' ? (uploadedFile?.size ?? null) : null,
        contentType: itemType === 'file' ? (uploadedFile?.contentType ?? null) : null,
        storagePath: itemType === 'file' ? (uploadedFile?.path ?? null) : null,
      });

      if (!isMountedRef.current) return;
      setTitle('');
      setUrl('');
      setText('');
      setFile(null);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onItemCreated?.();
      const data = await getCollectionItems(user.uid, collection.id, 50);
      if (isMountedRef.current) {
        setItems(data);
      }
      showToast('Elemento agregado', 'success');
    } catch (submitError) {
      console.error('Error creating collection item:', submitError);
      if (uploadedFile) {
        try {
          await deleteCollectionFile(uploadedFile.path);
        } catch (cleanupError) {
          console.error('Cleanup failed for collection file:', cleanupError);
        }
      }
      if (isMountedRef.current) {
        setFormError('No se pudo agregar el elemento.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteItem = async (item: CollectionItemRead) => {
    if (!user || deletingItemId) return;
    setDeletingItemId(item.id);
    setFormError(null);
    try {
      await deleteCollectionItem(user.uid, collection.id, item.id);
      if (item.type === 'file' && item.storagePath) {
        try {
          await deleteCollectionFile(item.storagePath);
        } catch (storageDeleteError) {
          console.error('Failed to delete file from storage:', storageDeleteError);
        }
      }
      if (!isMountedRef.current) return;
      setConfirmDeleteItemId(null);
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
      onItemDeleted?.();
      showToast('Elemento eliminado', 'success');
    } catch (deleteError) {
      console.error('Error deleting collection item:', deleteError);
      if (isMountedRef.current) {
        setFormError('No se pudo eliminar el elemento.');
      }
    } finally {
      if (isMountedRef.current) {
        setDeletingItemId(null);
      }
    }
  };

  const handleDeleteCollection = async () => {
    if (!user || isDeletingCollection) return;
    setIsDeletingCollection(true);
    setFormError(null);
    try {
      await deleteCollection(user.uid, collection.id);
      if (!isMountedRef.current) return;
      showToast('Carpeta eliminada', 'info');
      onCollectionDeleted?.(collection.id);
      onClose();
    } catch (deleteError) {
      console.error('Error deleting collection:', deleteError);
      if (isMountedRef.current) {
        setFormError('No se pudo eliminar la carpeta.');
        setConfirmDeleteCollection(false);
      }
    } finally {
      if (isMountedRef.current) {
        setIsDeletingCollection(false);
      }
    }
  };

  const iconOption = getCollectionIcon(collection.icon);
  const displayedCount = isLoading && items.length === 0 ? collection.itemCount : items.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-detail-title"
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-bg pb-[env(safe-area-inset-bottom)] md:max-w-2xl md:rounded-3xl md:pb-0">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 md:hidden" />
        <div className="flex flex-shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
              <iconOption.Icon size={19} />
            </div>
            <div className="min-w-0">
              <h2
                id="collection-detail-title"
                className="truncate font-display text-2xl text-white"
              >
                {collection.name}
              </h2>
              <p className="text-xs text-neutral-500">
                {displayedCount === 1 ? '1 guardado' : `${displayedCount} guardados`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onEditCollection && (
              <button
                type="button"
                onClick={() => onEditCollection(collection)}
                disabled={isBusy}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800 disabled:opacity-50"
                aria-label="Editar carpeta"
              >
                <Pencil size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDeleteCollection((prev) => !prev)}
              disabled={isBusy}
              className="p-2 text-neutral-400 hover:text-red-400 transition-colors rounded-full hover:bg-neutral-800 disabled:opacity-50"
              aria-label="Eliminar carpeta"
            >
              <Trash2 size={17} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {confirmDeleteCollection && (
          <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
            <p className="text-xs text-red-200">
              ¿Eliminar &ldquo;{collection.name}&rdquo; junto con todo su contenido?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCollection(false)}
                disabled={isDeletingCollection}
                className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCollection()}
                disabled={isDeletingCollection}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 disabled:opacity-50"
              >
                {isDeletingCollection ? 'Eliminando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
          <div className="space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Guardados
            </h3>
            {isLoading ? (
              <div className="text-sm text-neutral-500 text-center py-6">Cargando elementos...</div>
            ) : loadError ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-red-400">{loadError}</p>
                <button
                  type="button"
                  onClick={() => setReloadToken((prev) => prev + 1)}
                  className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
                >
                  Reintentar
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] py-8 text-center text-sm text-neutral-500">
                Aún no hay nada guardado aquí.
              </div>
            ) : (
              items.map((item) => {
                const isLink = item.type === 'link';
                const isFile = item.type === 'file';
                const subtitle = isLink ? item.url : isFile ? item.fileName : item.text;
                const openableUrl = (isLink || isFile) && isSafeHttpUrl(item.url) ? item.url : null;
                const isConfirmingDelete = confirmDeleteItemId === item.id;
                const isDeletingThis = deletingItemId === item.id;

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay p-3.5"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-neutral-300">
                      {isLink ? (
                        <Link2 size={18} />
                      ) : isFile ? (
                        <File size={18} />
                      ) : (
                        <FileText size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="truncate text-[15px] font-medium text-white">{item.title}</h4>
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs text-neutral-500">
                        {subtitle || 'Sin descripción'}
                      </p>
                      {isFile && item.fileSize ? (
                        <p className="text-neutral-600 text-xs mt-1">
                          {formatBytes(item.fileSize)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-neutral-500 text-xs flex-shrink-0">
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      {openableUrl && (
                        <a
                          href={openableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          Abrir
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDeleteItem(item)}
                            disabled={isDeletingThis}
                            className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            {isDeletingThis ? '...' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteItemId(null)}
                            disabled={isDeletingThis}
                            className="px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:text-white disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteItemId(item.id)}
                          disabled={isBusy}
                          className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                          aria-label={`Eliminar ${item.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <h3 className="text-sm font-semibold text-white">Agregar a la carpeta</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="collection-item-type"
                  className="mb-1.5 block text-xs font-medium text-neutral-400"
                >
                  Tipo
                </label>
                <select
                  id="collection-item-type"
                  value={itemType}
                  onChange={(event) => handleTypeChange(event.target.value as CollectionItemType)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white transition-colors focus:border-white/20 focus:outline-none"
                >
                  <option value="link">Enlace</option>
                  <option value="note">Nota</option>
                  <option value="file">Archivo</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="collection-item-title"
                  className="mb-1.5 block text-xs font-medium text-neutral-400"
                >
                  Título *
                </label>
                <input
                  id="collection-item-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={LIMITS.collectionItems.titleMaxLength}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white placeholder-neutral-500 transition-colors focus:border-white/20 focus:outline-none"
                  placeholder="Ej: Paper, Video, Idea"
                />
              </div>
            </div>

            {itemType === 'link' ? (
              <div key="collection-item-link-field">
                <label
                  htmlFor="collection-item-url"
                  className="mb-1.5 block text-xs font-medium text-neutral-400"
                >
                  Enlace *
                </label>
                <input
                  id="collection-item-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  maxLength={LIMITS.collectionItems.urlMaxLength}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white placeholder-neutral-500 transition-colors focus:border-white/20 focus:outline-none"
                  placeholder="https://..."
                />
              </div>
            ) : itemType === 'note' ? (
              <div key="collection-item-note-field">
                <label
                  htmlFor="collection-item-note"
                  className="mb-1.5 block text-xs font-medium text-neutral-400"
                >
                  Nota *
                </label>
                <textarea
                  id="collection-item-note"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={LIMITS.collectionItems.noteMaxLength}
                  rows={3}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white placeholder-neutral-500 transition-colors focus:border-white/20 focus:outline-none resize-none"
                  placeholder="Guarda tu nota o resumen..."
                />
              </div>
            ) : (
              <div key="collection-item-file-field">
                <label
                  htmlFor="collection-item-file"
                  className="mb-1.5 block text-xs font-medium text-neutral-400"
                >
                  Archivo *
                </label>
                <input
                  ref={fileInputRef}
                  id="collection-item-file"
                  type="file"
                  accept={COLLECTION_FILE_ACCEPT}
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                  }}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-neutral-200 focus:border-white/20 focus:outline-none"
                />
                {file && (
                  <p className="text-xs text-neutral-500 mt-2">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                )}
                {uploadProgress !== null && (
                  <p className="text-xs text-neutral-500 mt-2">Subiendo {uploadProgress}%</p>
                )}
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
              >
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={isBusy}
                className="h-11 rounded-xl bg-brand-gold px-6 text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const CollectionDetailModal = ({
  isOpen,
  collection,
  onClose,
  onEditCollection,
  onCollectionDeleted,
  onItemCreated,
  onItemDeleted,
}: CollectionDetailModalProps) => {
  if (!isOpen || !collection) return null;

  return (
    <CollectionDetailDialog
      key={collection.id}
      collection={collection}
      onClose={onClose}
      onEditCollection={onEditCollection}
      onCollectionDeleted={onCollectionDeleted}
      onItemCreated={onItemCreated}
      onItemDeleted={onItemDeleted}
    />
  );
};

export default CollectionDetailModal;
