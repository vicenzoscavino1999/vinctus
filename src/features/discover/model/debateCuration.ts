import type { Debate } from '@/features/arena/types';
import { toDate } from '@/shared/lib/formatUtils';

export const getDebateSourceCount = (debate: Debate): number =>
  typeof debate.sourceCount === 'number' ? debate.sourceCount : (debate.linkCount ?? 0);

export const getDebateLikesCount = (debate: Debate): number =>
  typeof debate.likesCount === 'number' ? Math.max(0, debate.likesCount) : 0;

const getDebateCurationScore = (debate: Debate): number =>
  getDebateSourceCount(debate) * 3 + getDebateLikesCount(debate) * 2;

/** Up to six finished debates that cite sources, best curated first. */
export const curateArenaDebates = (debates: Debate[]): Debate[] =>
  [...debates]
    .filter((debate) => debate.status === 'done' && getDebateSourceCount(debate) > 0)
    .sort((a, b) => {
      const scoreDiff = getDebateCurationScore(b) - getDebateCurationScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const sourceDiff = getDebateSourceCount(b) - getDebateSourceCount(a);
      if (sourceDiff !== 0) return sourceDiff;
      const likesDiff = getDebateLikesCount(b) - getDebateLikesCount(a);
      if (likesDiff !== 0) return likesDiff;
      const aTime = toDate(a.createdAt)?.getTime() ?? 0;
      const bTime = toDate(b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, 6);
