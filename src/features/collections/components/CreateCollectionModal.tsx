import { createPortal } from 'react-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  createCollection,
  updateCollection,
  type CollectionRead,
} from '@/features/collections/api';
import { useToast } from '@/shared/ui/Toast';
import { COLLECTION_ICON_OPTIONS } from './collectionIcons';
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-editor-title"
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-center"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-bg pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-3xl md:pb-0">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 md:hidden" />
        <div className="flex flex-shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 id="collection-editor-title" className="font-display text-2xl text-white">
            {isEditing ? 'Editar carpeta' : 'Nueva carpeta'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex-1 space-y-5 overflow-y-auto px-5 pb-5"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="collection-name-input"
                className="text-xs font-medium text-neutral-400"
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
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-white placeholder-neutral-500 transition-colors focus:border-white/20 focus:outline-none"
              placeholder="Ej: Lecturas, Música, Ideas"
            />
          </div>

          <div>
            <p id="collection-icon-label" className="mb-2 text-xs font-medium text-neutral-400">
              Icono
            </p>
            <div role="radiogroup" aria-labelledby="collection-icon-label" className="flex gap-2">
              {COLLECTION_ICON_OPTIONS.map((option) => {
                const selected = option.value === icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option.label}
                    onClick={() => setIcon(option.value)}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${
                      selected
                        ? 'border-brand-gold/60 bg-brand-gold/15 text-brand-gold'
                        : 'border-white/[0.08] text-neutral-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <option.Icon size={20} />
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-xl border border-white/[0.1] text-sm font-medium text-neutral-200 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>,
    document.body,
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
