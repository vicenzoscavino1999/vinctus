import type { MouseEvent } from 'react';
import { Check } from 'lucide-react';
import type { CollaborationRead } from '@/features/collaborations/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import {
  collaborationTags,
  RELATION_LABEL,
  type CollaborationRelation,
} from '@/features/projects/model/connections';

type Props = {
  item: CollaborationRead;
  relation: CollaborationRelation;
  /** Opens the project, where the request is written and sent. */
  onOpen: () => void;
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-gold/60';

/**
 * One open project: its field and age, its name, who it looks for and who leads it, and whether
 * you can still ask to join. The whole card opens it; the title is the keyboard target.
 */
export default function CollaborationCard({ item, relation, onOpen }: Props) {
  const tags = collaborationTags(item);
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    onOpen();
  };

  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.035] md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          {item.context}
        </span>
        <span className="shrink-0 text-xs text-neutral-600">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>

      <h3 className="mt-3 font-display text-xl leading-snug text-white md:text-2xl">
        <button type="button" onClick={open} className={`rounded-sm text-left ${focusRing}`}>
          {item.title}
        </button>
      </h3>
      {item.seekingRole && (
        <p className="mt-1.5 text-sm text-neutral-400">
          Busca <span className="text-neutral-100">{item.seekingRole}</span>
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-4 pt-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-500">
            Por <span className="text-brand-gold/90">{item.authorSnapshot.displayName}</span>
          </p>
          {tags.length > 0 && (
            <p className="mt-1 truncate text-xs text-neutral-600">{tags.join(' · ')}</p>
          )}
        </div>

        {relation === 'open' ? (
          <button
            type="button"
            onClick={open}
            className={`shrink-0 rounded-full border border-brand-gold/40 px-3.5 py-1.5 text-xs font-medium text-brand-gold transition-colors hover:border-brand-gold hover:bg-brand-gold/10 ${focusRing}`}
          >
            {RELATION_LABEL.open}
          </button>
        ) : relation === 'requested' ? (
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-400 disabled:cursor-default"
          >
            <Check size={12} />
            {RELATION_LABEL.requested}
          </button>
        ) : (
          <span className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-400">
            {RELATION_LABEL.own}
          </span>
        )}
      </div>
    </article>
  );
}
