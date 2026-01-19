import { useEffect, useState, type FormEvent } from 'react';
import { File, FileText, Link2, Trash2, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import {
    createCollectionItem,
    deleteCollectionItem,
    getCollectionItems,
    type CollectionItemRead,
    type CollectionItemType,
    type CollectionRead
} from '../lib/firestore';
import { deleteCollectionFile, uploadCollectionFile } from '../lib/storage';
import { useToast } from './Toast';
import { getCollectionIcon } from './collectionIcons';

interface CollectionDetailModalProps {
    isOpen: boolean;
    collection: CollectionRead | null;
    onClose: () => void;
    onItemCreated?: () => void;
    onItemDeleted?: () => void;
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

const formatFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const MAX_COLLECTION_FILE_SIZE = 25 * 1024 * 1024;
const COLLECTION_FILE_TYPES = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
];
const COLLECTION_FILE_ACCEPT = COLLECTION_FILE_TYPES.join(',');

const CollectionDetailModal = ({
    isOpen,
    collection,
    onClose,
    onItemCreated,
    onItemDeleted
}: CollectionDetailModalProps) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [items, setItems] = useState<CollectionItemRead[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [itemType, setItemType] = useState<CollectionItemType>('link');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen || !collection || !user) {
            setItems([]);
            setError(null);
            setFile(null);
            setUploadProgress(null);
            return;
        }

        let isActive = true;
        const loadItems = async () => {
            try {
                setError(null);
                setIsLoading(true);
                const data = await getCollectionItems(user.uid, collection.id, 50);
                if (isActive) {
                    setItems(data);
                }
            } catch (loadError) {
                console.error('Error loading collection items:', loadError);
                if (isActive) {
                    setError('No se pudieron cargar los elementos.');
                }
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        loadItems();

        return () => {
            isActive = false;
        };
    }, [isOpen, collection, user]);

    useEffect(() => {
        setError(null);
        if (itemType !== 'link') {
            setUrl('');
        }
        if (itemType !== 'note') {
            setText('');
        }
        if (itemType !== 'file') {
            setFile(null);
            setUploadProgress(null);
        }
    }, [itemType]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!user || !collection) {
            setError('Debes iniciar sesion.');
            return;
        }

        const trimmedTitle = title.trim();
        const trimmedUrl = url.trim();
        const trimmedText = text.trim();

        if (!trimmedTitle) {
            setError('El titulo es obligatorio.');
            return;
        }

        if (itemType === 'link' && !trimmedUrl) {
            setError('Ingresa un enlace valido.');
            return;
        }

        if (itemType === 'note' && !trimmedText) {
            setError('Ingresa una nota.');
            return;
        }

        if (itemType === 'file') {
            if (!file) {
                setError('Selecciona un archivo.');
                return;
            }
            if (!file.type || !COLLECTION_FILE_TYPES.includes(file.type)) {
                setError('Tipo de archivo no permitido.');
                return;
            }
            if (file.size > MAX_COLLECTION_FILE_SIZE) {
                setError('El archivo supera 25MB.');
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
            if (itemType === 'file' && file) {
                const uploadId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                uploadedFile = await uploadCollectionFile(file, user.uid, collection.id, uploadId, (progress) => {
                    if (progress.totalBytes > 0) {
                        setUploadProgress(Math.round((progress.bytesTransferred / progress.totalBytes) * 100));
                    }
                });
            }

            await createCollectionItem(user.uid, collection.id, {
                collectionName: collection.name,
                type: itemType,
                title: trimmedTitle,
                url: itemType === 'link' ? trimmedUrl : uploadedFile?.url ?? null,
                text: itemType === 'note' ? trimmedText : null,
                fileName: itemType === 'file' ? uploadedFile?.fileName ?? null : null,
                fileSize: itemType === 'file' ? uploadedFile?.size ?? null : null,
                contentType: itemType === 'file' ? uploadedFile?.contentType ?? null : null,
                storagePath: itemType === 'file' ? uploadedFile?.path ?? null : null
            });
            setTitle('');
            setUrl('');
            setText('');
            setFile(null);
            setUploadProgress(null);
            onItemCreated?.();
            const data = await getCollectionItems(user.uid, collection.id, 50);
            setItems(data);
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
            setError('No se pudo agregar el elemento.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (item: CollectionItemRead) => {
        if (!user || !collection) return;
        const confirmed = window.confirm('Eliminar este elemento?');
        if (!confirmed) return;
        try {
            if (item.type === 'file' && item.storagePath) {
                try {
                    await deleteCollectionFile(item.storagePath);
                } catch (deleteError) {
                    console.error('Failed to delete file from storage:', deleteError);
                }
            }
            await deleteCollectionItem(user.uid, collection.id, item.id);
            onItemDeleted?.();
            const data = await getCollectionItems(user.uid, collection.id, 50);
            setItems(data);
            showToast('Elemento eliminado', 'success');
        } catch (deleteError) {
            console.error('Error deleting collection item:', deleteError);
            setError('No se pudo eliminar el elemento.');
        }
    };

    if (!isOpen || !collection) return null;

    const iconOption = getCollectionIcon(collection.icon);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-3xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-200">
                            <iconOption.Icon size={18} />
                        </div>
                        <div>
                            <h2 className="text-xl font-serif text-white">{collection.name}</h2>
                            <p className="text-xs text-neutral-500">{collection.itemCount} guardados</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Tipo
                                </label>
                                <select
                                    value={itemType}
                                    onChange={(event) => setItemType(event.target.value as CollectionItemType)}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                                >
                                    <option value="link">Enlace</option>
                                    <option value="note">Nota</option>
                                    <option value="file">Archivo</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Titulo *
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    maxLength={160}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                                    placeholder="Ej: Paper, Video, Idea"
                                />
                            </div>
                        </div>

                        {itemType === 'link' ? (
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Enlace *
                                </label>
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(event) => setUrl(event.target.value)}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                                    placeholder="https://..."
                                />
                            </div>
                        ) : itemType === 'note' ? (
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Nota *
                                </label>
                                <textarea
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    maxLength={2000}
                                    rows={3}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                                    placeholder="Guarda tu nota o resumen..."
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                                    Archivo *
                                </label>
                                <input
                                    type="file"
                                    accept={COLLECTION_FILE_ACCEPT}
                                    onChange={(event) => {
                                        const selected = event.target.files?.[0] ?? null;
                                        setFile(selected);
                                    }}
                                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white file:text-neutral-300 file:border-0 file:bg-neutral-800 file:rounded-md file:px-3 file:py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                                {file && (
                                    <p className="text-xs text-neutral-500 mt-2">
                                        {file.name} · {formatFileSize(file.size)}
                                    </p>
                                )}
                                {uploadProgress !== null && (
                                    <p className="text-xs text-neutral-500 mt-2">Subiendo {uploadProgress}%</p>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center justify-end">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Guardando...' : 'Agregar'}
                            </button>
                        </div>
                    </form>

                    <div className="space-y-3">
                        <h3 className="text-xs text-neutral-500 uppercase tracking-widest">Elementos</h3>
                        {isLoading ? (
                            <div className="text-sm text-neutral-500 text-center py-6">Cargando elementos...</div>
                        ) : items.length === 0 ? (
                            <div className="text-sm text-neutral-500 text-center py-6">Aun no hay elementos.</div>
                        ) : (
                            items.map((item) => {
                                const isLink = item.type === 'link';
                                const isFile = item.type === 'file';
                                const subtitle = isLink ? item.url : isFile ? item.fileName : item.text;
                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-4 bg-neutral-900/30 border border-neutral-800 rounded-lg p-4"
                                    >
                                        <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center flex-shrink-0 text-neutral-300">
                                            {isLink ? <Link2 size={18} /> : isFile ? <File size={18} /> : <FileText size={18} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-white text-sm font-medium truncate">{item.title}</h4>
                                            <p className="text-neutral-500 text-xs mt-0.5">
                                                {subtitle || 'Sin descripcion'}
                                            </p>
                                            {isFile && item.fileSize ? (
                                                <p className="text-neutral-600 text-xs mt-1">{formatFileSize(item.fileSize)}</p>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-3 text-neutral-500 text-xs flex-shrink-0">
                                            <span>{formatRelativeTime(item.createdAt)}</span>
                                            {isFile && item.url ? (
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-amber-400 hover:text-amber-300 transition-colors"
                                                >
                                                    Abrir
                                                </a>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(item)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                                aria-label="Eliminar"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectionDetailModal;
