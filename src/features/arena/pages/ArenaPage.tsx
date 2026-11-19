import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { collection, doc, getDoc } from 'firebase/firestore';
import {
  createDebate,
  likeArenaDebateWithSync,
  saveArenaDebateWithSync,
  unlikeArenaDebateWithSync,
  unsaveArenaDebateWithSync,
} from '@/features/arena/api/mutations';
import {
  getArenaUsage,
  isArenaDebateLiked,
  isArenaDebateSaved,
  subscribeToDebate,
  subscribeToTurns,
} from '@/features/arena/api/queries';
import { DebateViewer } from '@/features/arena/components/DebateViewer';
import { PersonaPicker } from '@/features/arena/components/PersonaPicker';
import { TopicInput } from '@/features/arena/components/TopicInput';
import type { Debate, DebateVisibility, Persona, Turn, UsageStats } from '@/features/arena/types';
import { getPersonaById } from '@/features/arena/types';
import { AIModeTabs } from '@/features/ai/components/AIModeTabs';
import { useAuth } from '@/context/auth';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import { LEGAL_COPY } from '@/shared/constants';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import { db } from '@/shared/lib/firebase';
import { useToast } from '@/shared/ui/Toast';
import { COLLECTIONS, LIMITS } from '@/shared/lib/firestore/firestoreContract';

function ArenaSession({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const { debateId } = useParams<{ debateId?: string }>();
  const { showToast } = useToast();

  const [topic, setTopic] = useState('');
  const [personaA, setPersonaA] = useState<Persona | null>(null);
  const [personaB, setPersonaB] = useState<Persona | null>(null);
  const [visibility, setVisibility] = useState<DebateVisibility>('public');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiConsent, setHasAiConsent] = useState(() =>
    userId ? getAIConsent(userId).granted : false,
  );
  const [isConsentSyncing, setIsConsentSyncing] = useState(Boolean(userId));
  const [consentSyncError, setConsentSyncError] = useState<string | null>(null);

  const [debateSnapshot, setDebateSnapshot] = useState<{
    id: string;
    debate: Debate | null;
  } | null>(null);
  const [turnsSnapshot, setTurnsSnapshot] = useState<{
    id: string;
    turns: Turn[];
  } | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [likedSnapshot, setLikedSnapshot] = useState<{ key: string; value: boolean } | null>(null);
  const [isLikingDebate, setIsLikingDebate] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<{ key: string; value: boolean } | null>(null);
  const [isSavingDebate, setIsSavingDebate] = useState(false);
  const isMountedRef = useRef(true);

  const isViewing = Boolean(debateId);
  const reactionKey = debateId && userId ? `${userId}:${debateId}` : null;
  const debate = debateId && debateSnapshot?.id === debateId ? debateSnapshot.debate : null;
  const loadedDebateId = debateId && debateSnapshot?.id === debateId ? debateId : null;
  const turns = debateId && turnsSnapshot?.id === debateId ? turnsSnapshot.turns : [];
  const isDebateLiked =
    reactionKey && likedSnapshot?.key === reactionKey ? likedSnapshot.value : false;
  const isDebateSaved =
    reactionKey && savedSnapshot?.key === reactionKey ? savedSnapshot.value : false;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadUsage = useCallback(async () => {
    if (!userId) return;
    setUsageError(null);
    try {
      const nextUsage = await getArenaUsage();
      if (!isMountedRef.current) return;
      setUsage(nextUsage);
    } catch (err) {
      console.error('getArenaUsage failed:', err);
      if (!isMountedRef.current) return;
      setUsageError('No se pudo cargar tu límite diario.');
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) return undefined;
    getArenaUsage()
      .then((nextUsage) => {
        if (!active) return;
        setUsage(nextUsage);
        setUsageError(null);
      })
      .catch((err) => {
        console.error('getArenaUsage failed:', err);
        if (!active) return;
        setUsageError('No se pudo cargar tu límite diario.');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const accessibleDebateId = debate?.id && debate.id === debateId ? debate.id : null;

  useEffect(() => {
    if (!debateId) return undefined;

    const unsubscribeDebate = subscribeToDebate(debateId, (nextDebate) => {
      setDebateSnapshot({ id: debateId, debate: nextDebate });
    });

    return () => {
      unsubscribeDebate();
    };
  }, [debateId]);

  useEffect(() => {
    if (!accessibleDebateId) return undefined;

    const unsubscribeTurns = subscribeToTurns(accessibleDebateId, (nextTurns) => {
      setTurnsSnapshot({ id: accessibleDebateId, turns: nextTurns });
    });

    return () => {
      unsubscribeTurns();
    };
  }, [accessibleDebateId]);

  useEffect(() => {
    if (!accessibleDebateId || !userId || !reactionKey) return undefined;

    let isActive = true;
    isArenaDebateLiked(accessibleDebateId, userId)
      .then((liked) => {
        if (!isActive) return;
        setLikedSnapshot({ key: reactionKey, value: liked });
      })
      .catch((likeStateError) => {
        console.error('isArenaDebateLiked failed:', likeStateError);
      });

    return () => {
      isActive = false;
    };
  }, [accessibleDebateId, userId, reactionKey]);

  useEffect(() => {
    if (!accessibleDebateId || !userId || !reactionKey) return undefined;

    let isActive = true;
    isArenaDebateSaved(accessibleDebateId, userId)
      .then((saved) => {
        if (!isActive) return;
        setSavedSnapshot({ key: reactionKey, value: saved });
      })
      .catch((saveStateError) => {
        console.error('isArenaDebateSaved failed:', saveStateError);
      });

    return () => {
      isActive = false;
    };
  }, [accessibleDebateId, userId, reactionKey]);

  const syncConsent = useCallback(async () => {
    if (!userId) {
      setHasAiConsent(false);
      setIsConsentSyncing(false);
      setConsentSyncError(null);
      return;
    }

    const localConsent = getAIConsent(userId);
    setConsentSyncError(null);
    setIsConsentSyncing(true);
    try {
      const serverConsent = await getServerAIConsent(userId);
      if (!isMountedRef.current) return;

      if (serverConsent.recorded) {
        setAIConsent(serverConsent.granted, userId);
        setHasAiConsent(serverConsent.granted);
        return;
      }

      if (localConsent.granted) {
        await updateServerAIConsent(userId, true, 'migration');
        if (!isMountedRef.current) return;
        setHasAiConsent(true);
      } else {
        setHasAiConsent(false);
      }
    } catch (syncError) {
      console.error('Error syncing AI consent on Arena:', syncError);
      if (!isMountedRef.current) return;
      setConsentSyncError('No se pudo verificar tu consentimiento de IA. Intenta de nuevo.');
    } finally {
      if (isMountedRef.current) {
        setIsConsentSyncing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void syncConsent();
  }, [syncConsent]);

  const trimmedTopicLength = topic.trim().length;
  const formValid =
    trimmedTopicLength >= 5 &&
    trimmedTopicLength <= LIMITS.arena.topicMaxLength &&
    personaA !== null &&
    personaB !== null &&
    personaA.id !== personaB.id;

  const disableCreate =
    !formValid || isCreating || usage?.remaining === 0 || !hasAiConsent || isConsentSyncing;

  const usageLabel = useMemo(() => {
    if (!usage) return usageError ? '—' : '...';
    return `${usage.used}/${usage.limit}`;
  }, [usage, usageError]);

  const handleCreate = async () => {
    if (isCreating) return;
    if (!hasAiConsent) {
      setError('Debes aceptar el consentimiento de IA antes de crear debates.');
      return;
    }

    if (!userId) {
      setError('Debes iniciar sesión para usar Arena.');
      return;
    }
    if (!personaA || !personaB) {
      setError('Selecciona ambas personas.');
      return;
    }
    if (personaA.id === personaB.id) {
      setError('Las personas deben ser diferentes.');
      return;
    }

    setIsCreating(true);
    setError(null);
    let clientDebateId = '';

    try {
      clientDebateId = doc(collection(db, COLLECTIONS.arenaDebates)).id;
      navigate(`/arena/${clientDebateId}`);

      const result = await createDebate({
        topic: topic.trim(),
        personaA: personaA.id,
        personaB: personaB.id,
        visibility,
        clientDebateId,
      });
      if (!isMountedRef.current) return;
      if (usage) {
        setUsage({
          ...usage,
          used: Math.max(0, usage.limit - result.remaining),
          remaining: result.remaining,
        });
      }
      if (result.debateId !== clientDebateId) {
        navigate(`/arena/${result.debateId}`);
      }
    } catch (createError) {
      if (!isMountedRef.current) return;
      setError(createError instanceof Error ? createError.message : 'No se pudo crear el debate.');
      if (!clientDebateId) {
        navigate('/arena');
      } else {
        const createdDebate = await getDoc(doc(db, COLLECTIONS.arenaDebates, clientDebateId)).catch(
          () => null,
        );
        if (!isMountedRef.current) return;
        if (!createdDebate?.exists()) {
          navigate('/arena');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  };

  const handleRetry = () => {
    if (!debate) return;
    setTopic(debate.topic);
    navigate('/arena');
  };

  const handleBackToCreator = () => {
    navigate('/arena');
  };

  const handleCreateAnother = () => {
    if (debate) {
      setTopic(debate.topic);
      setPersonaA(getPersonaById(debate.personaA) || null);
      setPersonaB(getPersonaById(debate.personaB) || null);
    }
    setError(null);
    navigate('/arena');
  };

  const handleToggleSaveDebate = async () => {
    if (isSavingDebate) return;
    if (!userId) {
      showToast('Inicia sesión para guardar debates', 'info');
      return;
    }
    if (!debate || debate.status !== 'done') return;

    const nextSaved = !isDebateSaved;
    if (reactionKey) {
      setSavedSnapshot({ key: reactionKey, value: nextSaved });
    }
    setIsSavingDebate(true);

    try {
      if (nextSaved) {
        await saveArenaDebateWithSync(
          {
            debateId: debate.id,
            topic: debate.topic,
            personaA: debate.personaA,
            personaB: debate.personaB,
            summary: debate.summary ?? null,
            verdictWinner: debate.verdict?.winner ?? null,
          },
          userId,
        );
        showToast('Debate guardado en tu perfil', 'success');
      } else {
        await unsaveArenaDebateWithSync(debate.id, userId);
        showToast('Debate eliminado de guardados', 'info');
      }
    } catch (saveError) {
      console.error('save debate failed:', saveError);
      if (isMountedRef.current && reactionKey) {
        setSavedSnapshot({ key: reactionKey, value: !nextSaved });
      }
      showToast('No se pudo actualizar el guardado', 'error');
    } finally {
      if (isMountedRef.current) {
        setIsSavingDebate(false);
      }
    }
  };

  const handleToggleLikeDebate = async () => {
    if (isLikingDebate) return;
    if (!userId) {
      showToast('Inicia sesión para reaccionar a debates', 'info');
      return;
    }
    if (!debate || debate.status !== 'done') return;

    const nextLiked = !isDebateLiked;
    const previousLikes = typeof debate.likesCount === 'number' ? debate.likesCount : 0;
    const nextLikes = Math.max(0, previousLikes + (nextLiked ? 1 : -1));
    const targetDebateId = debate.id;

    if (reactionKey) {
      setLikedSnapshot({ key: reactionKey, value: nextLiked });
    }
    setIsLikingDebate(true);
    setDebateSnapshot((prev) =>
      prev && prev.id === targetDebateId && prev.debate
        ? { ...prev, debate: { ...prev.debate, likesCount: nextLikes } }
        : prev,
    );

    try {
      if (nextLiked) {
        await likeArenaDebateWithSync(targetDebateId, userId);
        showToast('Te gustó este debate', 'success');
      } else {
        await unlikeArenaDebateWithSync(targetDebateId, userId);
      }
    } catch (likeError) {
      console.error('like debate failed:', likeError);
      if (isMountedRef.current) {
        if (reactionKey) {
          setLikedSnapshot({ key: reactionKey, value: !nextLiked });
        }
        setDebateSnapshot((prev) =>
          prev && prev.id === targetDebateId && prev.debate
            ? { ...prev, debate: { ...prev.debate, likesCount: previousLikes } }
            : prev,
        );
      }
      showToast('No se pudo actualizar el like', 'error');
    } finally {
      if (isMountedRef.current) {
        setIsLikingDebate(false);
      }
    }
  };

  const handleAcceptAiConsent = async () => {
    if (isConsentSyncing) return;
    setIsConsentSyncing(true);
    setConsentSyncError(null);
    setError(null);

    try {
      if (!userId) {
        throw new Error('Debes iniciar sesión para guardar el consentimiento.');
      }
      await updateServerAIConsent(userId, true, 'arena');
      if (!isMountedRef.current) return;
      setAIConsent(true, userId);
      setHasAiConsent(true);
    } catch (consentError) {
      console.error('Error accepting AI consent on Arena:', consentError);
      if (!isMountedRef.current) return;
      setHasAiConsent(false);
      setConsentSyncError('No se pudo guardar tu consentimiento de IA. Intenta nuevamente.');
    } finally {
      if (isMountedRef.current) {
        setIsConsentSyncing(false);
      }
    }
  };

  const debateNotFound = Boolean(
    isViewing && !isCreating && loadedDebateId === debateId && !debate,
  );

  return (
    <div className="page-transition pb-24">
      <header className="mb-8 flex flex-col gap-4 pt-6 md:pt-10">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-2 text-brand-gold">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-display-sm md:text-display-md font-display text-white">Arena IA</h1>
            <p className="text-sm text-neutral-500">
              Debates estructurados entre perspectivas opuestas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-neutral-500">
          <span>Debates hoy:</span>
          <span className={usage?.remaining === 0 ? 'text-red-400' : 'text-brand-gold'}>
            {usageLabel}
          </span>
          {usageError && (
            <button
              type="button"
              onClick={() => void loadUsage()}
              className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-[10px] text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Reintentar
            </button>
          )}
        </div>

        <AIModeTabs active="arena" />
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-400">
          <p>{LEGAL_COPY.aiDisclosure}</p>
          <Link
            to="/legal/privacy"
            className="mt-2 inline-block text-amber-300 hover:text-amber-200 transition-colors"
          >
            Ver política de privacidad
          </Link>
        </div>

        {consentSyncError && hasAiConsent && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <span>{consentSyncError}</span>
            <button
              type="button"
              onClick={() => void syncConsent()}
              disabled={isConsentSyncing}
              className="rounded-full border border-amber-400/50 px-3 py-1 text-xs text-amber-100 hover:border-amber-300 disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {!hasAiConsent && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <p>{LEGAL_COPY.aiConsent}</p>
            {consentSyncError && <p className="mt-2 text-red-100">{consentSyncError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAcceptAiConsent}
                disabled={isConsentSyncing}
                className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-400 transition-colors disabled:opacity-60"
              >
                {isConsentSyncing ? 'Guardando...' : 'Aceptar y continuar'}
              </button>
              {consentSyncError && (
                <button
                  type="button"
                  onClick={() => void syncConsent()}
                  disabled={isConsentSyncing}
                  className="rounded-full border border-red-400/60 px-4 py-1.5 text-xs text-red-100 hover:border-red-300 disabled:opacity-60"
                >
                  Reintentar
                </button>
              )}
              <Link
                to="/settings"
                className="rounded-full border border-red-400/60 px-4 py-1.5 text-xs text-red-100 hover:border-red-300"
              >
                Gestionar en Settings
              </Link>
            </div>
          </div>
        )}
      </header>

      {isViewing ? (
        <DebateViewer
          debate={debate}
          turns={turns}
          isLoading={!debate && !debateNotFound}
          notFound={debateNotFound}
          onRetry={handleRetry}
          onBack={handleBackToCreator}
          onCreateAnother={handleCreateAnother}
          onToggleLike={debate?.status === 'done' ? handleToggleLikeDebate : undefined}
          onToggleSave={debate?.status === 'done' ? handleToggleSaveDebate : undefined}
          isLiked={isDebateLiked}
          isLiking={isLikingDebate}
          isSaved={isDebateSaved}
          isSaving={isSavingDebate}
        />
      ) : (
        <section className="space-y-6">
          <div className="card card-premium space-y-6">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Tema</p>
              <TopicInput value={topic} onChange={setTopic} disabled={isCreating} />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <PersonaPicker
                label="Persona A (defiende)"
                selectedId={personaA?.id || null}
                onSelect={setPersonaA}
                excludeId={personaB?.id}
                disabled={isCreating}
              />
              <PersonaPicker
                label="Persona B (contraparte)"
                selectedId={personaB?.id || null}
                onSelect={setPersonaB}
                excludeId={personaA?.id}
                disabled={isCreating}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/80 pt-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-neutral-500">Visibilidad</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {visibility === 'public'
                    ? 'Visible en Descubrir y compartible por enlace.'
                    : 'Solo tú podrás ver este debate.'}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900/60 p-1">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  disabled={isCreating}
                  aria-pressed={visibility === 'public'}
                  className={`rounded-md px-3 py-1.5 text-xs transition ${
                    visibility === 'public'
                      ? 'bg-brand-gold font-medium text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Público
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  disabled={isCreating}
                  aria-pressed={visibility === 'private'}
                  className={`rounded-md px-3 py-1.5 text-xs transition ${
                    visibility === 'private'
                      ? 'bg-brand-gold font-medium text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Privado
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={disableCreate}
              onClick={handleCreate}
              className="btn-accent w-full"
            >
              {isCreating
                ? 'Generando debate...'
                : usage?.remaining === 0
                  ? 'Límite diario alcanzado'
                  : 'Iniciar debate'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Formato</p>
              <p className="mt-2 text-sm text-neutral-200">6 turnos alternados A/B</p>
            </article>
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Salida</p>
              <p className="mt-2 text-sm text-neutral-200">Resumen + veredicto imparcial</p>
            </article>
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Tiempo</p>
              <p className="mt-2 text-sm text-neutral-200">Normalmente menos de 20 segundos</p>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}

export default function ArenaPage() {
  const { user } = useAuth();
  return <ArenaSession key={user?.uid ?? 'anon'} userId={user?.uid ?? null} />;
}
