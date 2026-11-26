import { describe, expect, it } from 'vitest';
import type { MessageRead } from '@/features/chat/api';
import { describeRuns, formatDayLabel, RUN_GAP_MS } from './messageRuns';

const message = (id: string, senderId: string, createdAt: Date): MessageRead => ({
  id,
  senderId,
  text: id,
  createdAt,
  clientCreatedAt: createdAt.getTime(),
  clientId: id,
});

describe('describeRuns', () => {
  const base = new Date(2026, 10, 20, 10, 0);
  const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000);

  it('joins consecutive messages from the same sender', () => {
    const runs = describeRuns([
      message('a', 'ana', at(0)),
      message('b', 'ana', at(1)),
      message('c', 'ana', at(2)),
    ]);
    expect(runs.map((run) => [run.joinsPrevious, run.joinsNext])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
  });

  it('starts a new run for another sender or after a long gap', () => {
    const runs = describeRuns([
      message('a', 'ana', at(0)),
      message('b', 'bob', at(1)),
      message('c', 'bob', new Date(at(1).getTime() + RUN_GAP_MS)),
    ]);
    expect(runs.map((run) => run.joinsPrevious)).toEqual([false, false, false]);
  });

  it('shows the day separator on the first message of each day', () => {
    const runs = describeRuns([
      message('a', 'ana', at(0)),
      message('b', 'ana', at(5)),
      message('c', 'ana', at(24 * 60)),
    ]);
    expect(runs.map((run) => run.showDay)).toEqual([true, false, true]);
    expect(runs[2].joinsPrevious).toBe(false);
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2026, 10, 25, 18, 0);

  it('says Hoy and Ayer', () => {
    expect(formatDayLabel(new Date(2026, 10, 25, 8, 0), now)).toBe('Hoy');
    expect(formatDayLabel(new Date(2026, 10, 24, 23, 0), now)).toBe('Ayer');
  });

  it('uses the weekday within a week and the year only when it differs', () => {
    expect(formatDayLabel(new Date(2026, 10, 21), now)).toMatch(/^Sábado/);
    expect(formatDayLabel(new Date(2026, 9, 2), now)).not.toMatch(/2026/);
    expect(formatDayLabel(new Date(2025, 9, 2), now)).toMatch(/2025/);
  });
});
