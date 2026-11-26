import { useCallback, useEffect, useRef, useState } from 'react';
import { getSavedArenaDebates } from '@/features/arena/api/queries';
import { unsaveArenaDebateWithSync } from '@/features/arena/api/mutations';
import type { SavedArenaDebate } from '@/features/arena/types';
import { useToast } from '@/shared/ui/Toast';

/** The signed-in person's saved Arena debates, with "Quitar". */
export function useSavedDebates(userId: string | null) {
  const { showToast } = useToast();
  const toast = useRef(showToast);
  useEffect(() => {
    toast.current = showToast;
  });
  const [debates, setDebates] = useState<SavedArenaDebate[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const current = ++request.current;
    setError(null);
    setLoading(true);
    try {
      const data = await getSavedArenaDebates(userId, 20);
      if (current === request.current) setDebates(data);
    } catch (loadError) {
      if (current !== request.current) return;
      console.error('Error loading saved debates:', loadError);
      setError('No se pudieron cargar tus debates guardados.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);

  const remove = useCallback(
    async (debateId: string) => {
      if (!userId) return;
      setRemovingId(debateId);
      try {
        await unsaveArenaDebateWithSync(debateId, userId);
        setDebates((previous) => previous.filter((item) => item.debateId !== debateId));
        toast.current('Debate eliminado de guardados', 'success');
      } catch (removeError) {
        console.error('Error removing saved debate:', removeError);
        toast.current('No se pudo eliminar el debate guardado', 'error');
      } finally {
        setRemovingId(null);
      }
    },
    [userId],
  );

  return { debates, loading, error, removingId, reload: load, remove };
}
