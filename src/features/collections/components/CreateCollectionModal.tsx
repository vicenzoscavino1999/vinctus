import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  createCollection,
  updateCollection,
  type CollectionRead,
} from '@/features/collections/api';
import { useToast } from '@/shared/ui/Toast';
import { COLLECTION_ICON_OPTIONS, getCollectionIcon } from './collectionIcons';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface CreateCollectionModalProps {
  isOpen: boolean;
  initialCollection?: CollectionRead | null;
  onClose: () => void;
  onSaved: () => void;
}

const CollectionEditorForm = ({
  initialCollection,
  onClose,
  onSaved,
}: Omit<CreateCollectionModalProps, 'isOpen'>) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isEditing = Boolean(initialCollection);
  const [name, setName] = useState(initialCollection?.name ?? '');
  const [icon, setIcon] = useState(initialCollection?.icon ?? 'folder');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesión para administrar carpetas.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (trimmedName.length > LIMITS.collections.nameMaxLength) {
      setError(`El nombre no puede superar ${LIMITS.collections.nameMaxLength} caracteres.`);
      return;
    }

    setIsSubmitting(true);
    try {
      if (initialCollection) {
        await updateCollection(user.uid, initialCollection.id, { name: trimmedName, icon });
        showToast('Carpeta actualizada', 'success');
      } else {
        await createCollection(user.uid, { name: trimmedName, icon });
        showToast('Carpeta creada', 'success');
      }
      onSaved();
    } catch (submitError) {
      console.error('Error saving collection:', submitError);
      setError(
        initialCollection ? 'No se pudo actualizar la carpeta.' : 'No se pudo crear la carpeta.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedIcon = getCollectionIcon(icon);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-editor-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto safe-area-inset py-6"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 flex-shrink-0">
          <h2 id="collection-editor-title" className="text-xl font-serif text-white">
            {isEditing ? 'Editar carpeta' : 'Nueva carpeta'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="collection-name-input"
                className="text-xs text-neutral-500 uppercase tracking-wider"
              >
                Nombre *
              </label>
              <span className="text-[11px] text-neutral-500">
                {name.length}/{LIMITS.collections.nameMaxLength}
              </span>
            </div>
            <input
              id="collection-name-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMITS.collections.nameMaxLength}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="Ej: Lecturas, Música, Ideas"
            />
          </div>

          <div>
            <label
              htmlFor="collection-icon-select"
              className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block"
            >
              Icono
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-300">
                <selectedIcon.Icon size={20} />
              </div>
              <select
                id="collection-icon-select"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                className="flex-1 bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              >
                {COLLECTION_ICON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Guardar'
              ) : (
                'Crear'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CreateCollectionModal = ({
  isOpen,
  initialCollection = null,
  onClose,
  onSaved,
}: CreateCollectionModalProps) => {
  if (!isOpen) return null;

  return (
    <CollectionEditorForm
      key={initialCollection?.id ?? 'new'}
      initialCollection={initialCollection}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
};

export default CreateCollectionModal;
