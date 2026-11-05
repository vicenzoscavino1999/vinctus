import { useEffect, useMemo, useState } from 'react';
import { getPublicArenaDebates } from '@/features/arena/api/queries';
import type { Debate } from '@/features/arena/types';
import { curateArenaDebates } from '@/features/discover/model/debateCuration';

/** "Debates IA destacados": the best public Arena debates that cite sources. */
export const useCuratedDebates = () => {
  const [arenaDebates, setArenaDebates] = useState<Debate[]>([]);
  const [arenaDebatesLoading, setArenaDebatesLoading] = useState(false);
  const [arenaDebatesError, setArenaDebatesError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadArenaDebates = async () => {
      setArenaDebatesLoading(true);
      setArenaDebatesError(null);
      try {
        const data = await getPublicArenaDebates(80);
        if (isActive) {
          setArenaDebates(data);
        }
      } catch (loadError) {
        console.error('Error loading arena debates for curation:', loadError);
        if (isActive) {
          setArenaDebatesError('No se pudieron cargar debates de Arena IA.');
        }
      } finally {
        if (isActive) {
          setArenaDebatesLoading(false);
        }
      }
    };

    void loadArenaDebates();

    return () => {
      isActive = false;
    };
  }, []);

  const curatedArenaDebates = useMemo(() => curateArenaDebates(arenaDebates), [arenaDebates]);

  return { curatedArenaDebates, arenaDebatesLoading, arenaDebatesError };
};
