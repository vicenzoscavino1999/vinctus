import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { createCollection } from '@/shared/lib/firestore';
import { useToast } from '@/shared/ui/Toast';
import { COLLECTION_ICON_OPTIONS, getCollectionIcon } from './collectionIcons';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateCollectionModal = ({ isOpen, onClose, onCreated }: CreateCollectionModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('folder');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setIcon('folder');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesion para crear carpetas.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('El nombre es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createCollection(user.uid, { name: trimmedName, icon });
      showToast('Carpeta creada', 'success');
      onCreated();
    } catch (submitError) {
      console.error('Error creating collection:', submitError);
      setError('No se pudo crear la carpeta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedIcon = getCollectionIcon(icon);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 flex-shrink-0">
          <h2 className="text-xl font-serif text-white">Nueva carpeta</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="Ej: Lecturas, Musica, Ideas"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Icono
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-300">
                <selectedIcon.Icon size={20} />
              </div>
              <select
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
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
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

export default CreateCollectionModal;
