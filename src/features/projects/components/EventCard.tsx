import type { MouseEvent } from 'react';
import { MapPin, Users } from 'lucide-react';
import type { FirestoreEvent } from '@/features/events/api';
import { attendanceLabel, eventDateParts, eventPlace } from '@/features/projects/model/connections';

type Props = {
  event: FirestoreEvent;
  attendees: number;
  onOpen: () => void;
};

/** An upcoming encounter: its date first, then its name, place and who is going. */
export default function EventCard({ event, attendees, onOpen }: Props) {
  const date = eventDateParts(event.startAt);
  const attendance = attendanceLabel(attendees, event.capacity);
  const open = (clickEvent: MouseEvent) => {
    clickEvent.stopPropagation();
    onOpen();
  };

  return (
    <article
      onClick={onOpen}
      className="flex h-full w-[15rem] cursor-pointer flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.035] md:w-[16rem]"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl leading-none text-white">{date.day}</span>
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-brand-gold/80">
          {date.month}
        </span>
      </div>
      <p className="mt-2 text-xs text-neutral-500">{date.when}</p>

      <h3 className="mt-4 line-clamp-2 font-display text-lg leading-snug text-white">
        <button
          type="button"
          onClick={open}
          className="rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-gold/60"
        >
          {event.title}
        </button>
      </h3>

      <div className="mt-auto space-y-1.5 pt-5 text-xs text-neutral-500">
        <p className="flex items-center gap-1.5">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{eventPlace(event)}</span>
        </p>
        <p className={`flex items-center gap-1.5 ${attendance.isFull ? 'text-brand-gold/80' : ''}`}>
          <Users size={12} className="shrink-0" />
          {attendance.text}
        </p>
      </div>
    </article>
  );
}
