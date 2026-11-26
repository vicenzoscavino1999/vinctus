import type { MessageRead } from '@/features/chat/api';

/** Messages from the same person within this gap join one run (tight spacing, one timestamp). */
export const RUN_GAP_MS = 5 * 60 * 1000;

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Hoy", "Ayer", the weekday within a week, else the date (with the year when it differs). */
export const formatDayLabel = (date: Date, now: Date = new Date()): string => {
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  const label = date.toLocaleDateString('es-ES', {
    weekday: days > 1 && days < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatMessageTime = (date: Date) =>
  date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export type MessageRun = {
  message: MessageRead;
  /** First message of its day: shows the day separator above it. */
  showDay: boolean;
  /** Same sender, same day and within RUN_GAP_MS of the previous message. */
  joinsPrevious: boolean;
  /** The next message joins this one's run. */
  joinsNext: boolean;
};

/** Where each message sits in its run, for spacing, corners, sender name, avatar and time. */
export const describeRuns = (messages: MessageRead[]): MessageRun[] => {
  const joins = (earlier: MessageRead | undefined, later: MessageRead | undefined) =>
    !!earlier &&
    !!later &&
    dayKey(earlier.createdAt) === dayKey(later.createdAt) &&
    earlier.senderId === later.senderId &&
    later.createdAt.getTime() - earlier.createdAt.getTime() < RUN_GAP_MS;

  return messages.map((message, index) => {
    const previous = messages[index - 1];
    return {
      message,
      showDay: !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt),
      joinsPrevious: joins(previous, message),
      joinsNext: joins(message, messages[index + 1]),
    };
  });
};
