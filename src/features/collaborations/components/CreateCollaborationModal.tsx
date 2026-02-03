import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  createCollaboration,
  updateCollaboration,
  type CollaborationLevel,
  type CollaborationMode,
  type CollaborationRead,
} from '@/features/collaborations/api';
import { useToast } from '@/shared/ui/Toast';

interface CreateCollaborationModalProps {
  isOpen: boolean;
  editingCollaboration?: CollaborationRead | null;
  onClose: () => void;
  onCreated: () => void;
  onUpdated?: () => void;
}

const CreateCollaborationModal = ({
  isOpen,
  editingCollaboration,
  onClose,
  onCreated,
  onUpdated,
}: CreateCollaborationModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [seekingRole, setSeekingRole] = useState('');
  const [mode, setMode] = useState<CollaborationMode>('virtual');
  const [location, setLocation] = useState('');
  const [level, setLevel] = useState<CollaborationLevel>('intermedio');
  const [topic, setTopic] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setContext('');
      setSeekingRole('');
      setMode('virtual');
      setLocation('');
      setLevel('intermedio');
      setTopic('');
      setTagsInput('');
      setError(null);
      setIsSubmitting(false);
      return;
    }

    if (editingCollaboration) {
      setTitle(editingCollaboration.title);
      setContext(editingCollaboration.context);
      setSeekingRole(editingCollaboration.seekingRole);
      setMode(editingCollaboration.mode);
      setLocation(editingCollaboration.location ?? '');
      setLevel(editingCollaboration.level);
      setTopic(editingCollaboration.topic ?? '');
      setTagsInput(editingCollaboration.tags.join(', '));
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, editingCollaboration]);

  const parsedTags = useMemo(() => {
    return tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .map((tag) => tag.slice(0, 40))
      .filter((tag) => tag.length > 0)
      .slice(0, 6);
  }, [tagsInput]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesion para publicar.');
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedContext = context.trim();
    const trimmedRole = seekingRole.trim();
    const trimmedLocation = location.trim();
    const trimmedTopic = topic.trim();

    if (!trimmedTitle || !trimmedContext || !trimmedRole) {
      setError('Completa los campos obligatorios.');
      return;
    }

    if (mode === 'presencial' && !trimmedLocation) {
      setError('Ingresa una ubicacion para colaboraciones presenciales.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: trimmedTitle,
        context: trimmedContext,
        seekingRole: trimmedRole,
        mode,
        location: mode === 'presencial' ? trimmedLocation : null,
        level,
        topic: trimmedTopic ? trimmedTopic : null,
        tags: parsedTags,
      };

      if (editingCollaboration) {
        await updateCollaboration(editingCollaboration.id, payload);
        showToast('Proyecto actualizado', 'success');
        if (onUpdated) {
          onUpdated();
        } else {
          onCreated();
        }
      } else {
        await createCollaboration(
          user.uid,
          {
            displayName: user.displayName || 'Usuario',
            photoURL: user.photoURL || null,
          },
          payload,
        );
        showToast('Proyecto publicado', 'success');
        onCreated();
      }
    } catch (submitError) {
      console.error('Error saving collaboration:', submitError);
      setError(
        editingCollaboration
          ? 'No se pudo actualizar el proyecto.'
          : 'No se pudo publicar el proyecto.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-xl font-serif text-white">
            {editingCollaboration ? 'Editar proyecto' : 'Publicar proyecto'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Titulo *
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: Busco Bajista (Contrabajo)"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Contexto / proyecto *
              </label>
              <input
                type="text"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                maxLength={120}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: Proyecto Jazz Experimental"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Que buscas *
              </label>
              <input
                type="text"
                value={seekingRole}
                onChange={(event) => setSeekingRole(event.target.value)}
                maxLength={80}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: Fisico, Musico, Desarrollador"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Modalidad *
              </label>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as CollaborationMode)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              >
                <option value="virtual">Virtual</option>
                <option value="presencial">Presencial</option>
              </select>
            </div>
            {mode === 'presencial' && (
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Ubicacion *
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={120}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  placeholder="Ej: Madrid, Presencial"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Nivel *
              </label>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as CollaborationLevel)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              >
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="experto">Experto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Tema especifico
            </label>
            <input
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={160}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="Ej: Improvisacion modal, paper en arXiv, etc."
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Tags (opcional, separados por comas)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              placeholder="Ej: Madrid, Presencial, Nivel Experto"
            />
            {parsedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-neutral-400 bg-neutral-800/70 px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
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
              ) : editingCollaboration ? (
                'Guardar cambios'
              ) : (
                'Publicar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCollaborationModal;
