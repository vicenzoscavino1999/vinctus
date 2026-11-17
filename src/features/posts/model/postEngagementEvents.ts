import type { ReactionKind } from './PostEngagementSession';

export const POST_REACTION_CONFIRMED_EVENT = 'vinctus:post-reaction-confirmed';
export type ConfirmedPostReaction = {
  uid: string;
  postId: string;
  kind: ReactionKind;
  value: boolean;
};

export function publishPostReaction(detail: ConfirmedPostReaction) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(POST_REACTION_CONFIRMED_EVENT, { detail }));
}

export function mergeReactionIds(ids: string[], overrides: Map<string, boolean>) {
  const result = new Set(ids);
  overrides.forEach((value, id) => {
    if (value) result.add(id);
    else result.delete(id);
  });
  return Array.from(result);
}
