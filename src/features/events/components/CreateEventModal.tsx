import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/auth';
import {
  createEvent,
  updateEvent,
  type EventVisibility,
  type FirestoreEvent,
} from '@/features/events/api';
import { useToast } from '@/shared/ui/Toast';

interface CreateEventModalProps {
  isOpen: boolean;
  editingEvent?: FirestoreEvent | null;
  onClose: () => void;
  onCreated: () => void;
  onUpdated?: () => void;
}

const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateInput = (value: Date | null): string => {
  if (!value) return '';
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const CreateEventModal = ({
  isOpen,
  editingEvent,
  onClose,
  onCreated,
  onUpdated,
}: CreateEventModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [city, setCity] = useState('');
  const [venue, setVenue] = useState('');
  const [capacity, setCapacity] = useState('');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setDescription('');
      setStartAt('');
      setEndAt('');
      setCity('');
      setVenue('');
      setCapacity('');
      setVisibility('public');
      setError(null);
      setIsSubmitting(false);
      return;
    }

    if (editingEvent) {
      setTitle(editingEvent.title ?? '');
      setDescription(editingEvent.description ?? '');
      setStartAt(formatDateInput(editingEvent.startAt));
      setEndAt(formatDateInput(editingEvent.endAt));
      setCity(editingEvent.city ?? '');
      setVenue(editingEvent.venue ?? '');
      setCapacity(editingEvent.capacity !== null ? String(editingEvent.capacity) : '');
      setVisibility(editingEvent.visibility ?? 'public');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, editingEvent]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesion para publicar.');
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedCity = city.trim();
    const trimmedVenue = venue.trim();

    if (!trimmedTitle) {
      setError('El titulo es obligatorio.');
      return;
    }

    const startDate = parseDate(startAt);
    if (!startDate) {
      setError('Ingresa una fecha de inicio valida.');
      return;
    }

    const endDate = parseDate(endAt);
    if (endAt && !endDate) {
      setError('Ingresa una fecha de cierre valida.');
      return;
    }

    if (endDate && endDate < startDate) {
      setError('La fecha de cierre debe ser posterior al inicio.');
      return;
    }

    let parsedCapacity: number | null = null;
    if (capacity.trim()) {
      const numeric = Number(capacity);
      if (!Number.isFinite(numeric) || numeric < 0) {
        setError('La capacidad debe ser un numero valido.');
        return;
      }
      parsedCapacity = Math.floor(numeric);
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: trimmedTitle,
        description: trimmedDescription ? trimmedDescription : null,
        startAt: startDate,
        endAt: endDate ?? null,
        city: trimmedCity ? trimmedCity : null,
        venue: trimmedVenue ? trimmedVenue : null,
        capacity: parsedCapacity,
        visibility,
      };

      if (editingEvent) {
        await updateEvent(editingEvent.id, payload);
        showToast('Encuentro actualizado', 'success');
        if (onUpdated) {
          onUpdated();
        } else {
          onCreated();
        }
      } else {
        await createEvent(user.uid, payload);
        showToast('Encuentro publicado', 'success');
        onCreated();
      }
    } catch (submitError) {
      console.error('Error saving event:', submitError);
      const fallbackMessage = 'No se pudo publicar el encuentro.';
      const errorMessage = submitError instanceof Error ? submitError.message : '';
      const errorCode =
        typeof submitError === 'object' && submitError && 'code' in submitError
          ? String((submitError as { code?: unknown }).code)
          : '';
      const permissionHint =
        errorCode.includes('permission') || errorMessage.toLowerCase().includes('permission')
          ? 'Permisos insuficientes. Revisa las reglas de Firestore.'
          : fallbackMessage;
      const detail = errorMessage ? ` (${errorMessage})` : '';
      setError(`${permissionHint}${detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 flex-shrink-0">
          <h2 className="text-xl font-serif text-white">
            {editingEvent ? 'Editar encuentro' : 'Publicar encuentro'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
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
                placeholder="Ej: Simposio de Arqueologia"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Visibilidad *
              </label>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as EventVisibility)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              >
                <option value="public">Publico</option>
                <option value="private">Privado</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Inicio *
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Fin (opcional)
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Ciudad
              </label>
              <input
                type="text"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                maxLength={80}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: Lima"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Lugar
              </label>
              <input
                type="text"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                maxLength={120}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: Barranco"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                Capacidad
              </label>
              <input
                type="number"
                min={0}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="Ej: 120"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
              placeholder="Describe el encuentro y lo que los asistentes pueden esperar."
            />
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
              ) : editingEvent ? (
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

export default CreateEventModal;
