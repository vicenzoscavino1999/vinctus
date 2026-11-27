import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import {
  AIConsentCard,
  AIConsentWarning,
  AIDisclosure,
  AIHeader,
} from '@/features/ai/components/AIShell';
import { useAIConsent } from '@/features/ai/hooks/useAIConsent';
import { useAIReport } from '@/features/ai/hooks/useAIReport';
import { useAuth } from '@/context/auth';
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
  const consent = useAIConsent(userId, 'arena');
  const aiReport = useAIReport();
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

  const trimmedTopicLength = topic.trim().length;
  const formValid =
    trimmedTopicLength >= 5 &&
    trimmedTopicLength <= LIMITS.arena.topicMaxLength &&
    personaA !== null &&
    personaB !== null &&
    personaA.id !== personaB.id;

  const disableCreate =
    !formValid || isCreating || usage?.remaining === 0 || !consent.granted || consent.busy;

  const usageLabel = useMemo(() => {
    if (!usage) return usageError ? '—' : '...';
    return `${usage.used}/${usage.limit}`;
  }, [usage, usageError]);

  const handleCreate = async () => {
    if (isCreating) return;
    if (!consent.granted) {
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

  const debateNotFound = Boolean(
    isViewing && !isCreating && loadedDebateId === debateId && !debate,
  );

  const handleShare = async () => {
    if (!debate) return;
    const url = `${window.location.origin}/arena/${debate.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
    } catch {
      window.prompt('Copia el enlace del debate:', url);
    }
  };

  const handleReport = () => {
    if (!debate) return;
    aiReport.report({
      contextId: `arena_${debate.id}`,
      excerpt: [debate.summary, debate.verdict?.reason, ...turns.map((turn) => turn.text)]
        .filter(Boolean)
        .join(' / '),
    });
  };

  const usagePill = userId ? (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-neutral-400">
        Debates hoy{' '}
        <span
          className={`font-semibold ${usage?.remaining === 0 ? 'text-red-400' : 'text-brand-gold'}`}
        >
          {usageLabel}
        </span>
      </span>
      {usageError && (
        <button
          type="button"
          onClick={() => void loadUsage()}
          className="text-[11px] text-neutral-400 underline underline-offset-2 hover:text-white"
        >
          Reintentar
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="page-transition mx-auto max-w-3xl pb-24">
      <AIHeader
        title="Arena IA"
        subtitle="Dos IA debaten un tema y un juez da el veredicto."
        active="arena"
        action={usagePill}
      />

      {consent.error && consent.granted && (
        <AIConsentWarning message={consent.error} onRetry={() => void consent.retry()} />
      )}

      {!consent.granted && !isViewing ? (
        consent.checking ? (
          <div className="flex justify-center py-20" role="status" aria-label="Verificando">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : (
          <AIConsentCard
            saving={consent.saving}
            error={consent.error}
            onAccept={() => void consent.accept()}
            onRetry={() => void consent.retry()}
          />
        )
      ) : isViewing ? (
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
          onReport={debate?.status === 'done' ? handleReport : undefined}
          onShare={debate?.status === 'done' ? () => void handleShare() : undefined}
          isLiked={isDebateLiked}
          isLiking={isLikingDebate}
          isSaved={isDebateSaved}
          isSaving={isSavingDebate}
        />
      ) : (
        <section className="space-y-7">
          <div>
            <p className="mb-2.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Tema
            </p>
            <TopicInput value={topic} onChange={setTopic} disabled={isCreating} />
          </div>

          <PersonaPicker
            label="A favor"
            side="A"
            selectedId={personaA?.id || null}
            onSelect={setPersonaA}
            excludeId={personaB?.id}
            disabled={isCreating}
          />
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-xs font-semibold tracking-widest text-neutral-600">VS</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <PersonaPicker
            label="En contra"
            side="B"
            selectedId={personaB?.id || null}
            onSelect={setPersonaB}
            excludeId={personaA?.id}
            disabled={isCreating}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm text-white">Visibilidad</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {visibility === 'public'
                  ? 'Visible en Descubrir y compartible por enlace.'
                  : 'Solo tú podrás ver este debate.'}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              {(['public', 'private'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setVisibility(option)}
                  disabled={isCreating}
                  aria-pressed={visibility === option}
                  className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                    visibility === option
                      ? 'bg-white font-medium text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {option === 'public' ? 'Público' : 'Privado'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={disableCreate}
              onClick={handleCreate}
              className="h-12 w-full rounded-2xl bg-brand-gold text-sm font-semibold text-black transition-opacity disabled:opacity-40"
            >
              {isCreating
                ? 'Generando debate...'
                : usage?.remaining === 0
                  ? 'Límite diario alcanzado'
                  : 'Iniciar debate'}
            </button>
            <p className="text-center text-xs text-neutral-500">
              6 turnos alternados · resumen y veredicto imparcial · normalmente menos de 20 segundos
            </p>
          </div>

          <AIDisclosure />
        </section>
      )}

      {aiReport.modal}
    </div>
  );
}

export default function ArenaPage() {
  const { user } = useAuth();
  return <ArenaSession key={user?.uid ?? 'anon'} userId={user?.uid ?? null} />;
}
