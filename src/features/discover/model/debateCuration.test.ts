import { describe, expect, it } from 'vitest';
import type { Debate } from '@/features/arena/types';
import { curateArenaDebates } from './debateCuration';

const debate = (id: string, overrides: Record<string, unknown> = {}): Debate =>
  ({
    id,
    status: 'done',
    sourceCount: 1,
    likesCount: 0,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }) as unknown as Debate;

describe('curateArenaDebates', () => {
  it('keeps only finished debates that cite sources', () => {
    const curated = curateArenaDebates([
      debate('ok'),
      debate('running', { status: 'running' }),
      debate('no-sources', { sourceCount: 0 }),
      debate('links-only', { sourceCount: undefined, linkCount: 2 }),
    ]);

    expect(curated.map((entry) => entry.id)).toEqual(['links-only', 'ok']);
  });

  it('ranks by sources and likes, then by date, and keeps six', () => {
    const curated = curateArenaDebates([
      debate('old', { createdAt: new Date('2026-01-01T00:00:00Z') }),
      debate('new', { createdAt: new Date('2026-10-20T00:00:00Z') }),
      debate('liked', { likesCount: 2 }),
      debate('sourced', { sourceCount: 3 }),
      debate('a'),
      debate('b'),
      debate('c'),
    ]);

    expect(curated).toHaveLength(6);
    expect(curated.slice(0, 3).map((entry) => entry.id)).toEqual(['sourced', 'liked', 'new']);
    expect(curated.map((entry) => entry.id)).not.toContain('old');
  });
});
