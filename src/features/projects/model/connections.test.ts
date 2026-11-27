import { describe, expect, it } from 'vitest';
import type { CollaborationRead } from '@/features/collaborations/api';
import {
  attendanceLabel,
  collaborationRelation,
  collaborationTags,
  eventDateParts,
  eventPlace,
  withoutBlocked,
} from '@/features/projects/model/connections';

const collab = (overrides: Partial<CollaborationRead> = {}): CollaborationRead => ({
  id: 'c-1',
  title: 'Telescopio',
  context: 'Astronomía',
  seekingRole: 'Óptica',
  mode: 'presencial',
  location: 'Lima',
  level: 'experto',
  topic: null,
  tags: [],
  authorId: 'author',
  authorSnapshot: { displayName: 'Sofía', photoURL: null },
  status: 'open',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

describe('collaborationTags', () => {
  it('uses up to three of its own tags, trimmed', () => {
    expect(collaborationTags(collab({ tags: [' Jazz ', '', 'Bajo', 'Ensayos', 'Extra'] }))).toEqual(
      ['Jazz', 'Bajo', 'Ensayos'],
    );
  });

  it('falls back to place, mode and level', () => {
    expect(collaborationTags(collab())).toEqual(['Lima', 'Presencial', 'Nivel Experto']);
    expect(
      collaborationTags(collab({ location: null, mode: 'virtual', level: 'principiante' })),
    ).toEqual(['Virtual', 'Nivel Principiante']);
  });
});

describe('collaborationRelation', () => {
  it('tells the own project, an asked one and an open one apart', () => {
    const requested = new Set(['c-asked']);
    expect(collaborationRelation(collab({ authorId: 'me' }), 'me', requested)).toBe('own');
    expect(collaborationRelation(collab({ id: 'c-asked' }), 'me', requested)).toBe('requested');
    expect(collaborationRelation(collab(), 'me', requested)).toBe('open');
    expect(collaborationRelation(collab({ authorId: 'me' }), null, requested)).toBe('open');
  });
});

describe('eventDateParts', () => {
  it('gives the day, the short month and the weekday with the time', () => {
    const parts = eventDateParts(new Date(2026, 11, 5, 20, 0));
    expect(parts.day).toBe('05');
    expect(parts.month).toBe('DIC');
    expect(parts.when).toBe('Sáb · 20:00');
  });

  it('says the date is not set yet', () => {
    expect(eventDateParts(null)).toEqual({ day: '--', month: '--', when: 'Fecha por confirmar' });
  });
});

describe('eventPlace', () => {
  it('joins city and venue, or says it is not set', () => {
    expect(eventPlace({ city: 'Lima', venue: 'Observatorio' })).toBe('Lima, Observatorio');
    expect(eventPlace({ city: null, venue: null })).toBe('Ubicación por confirmar');
  });
});

describe('attendanceLabel', () => {
  it('says when an encounter is full', () => {
    expect(attendanceLabel(12, 12)).toEqual({ text: 'Completo · 12/12', isFull: true });
  });

  it('counts against the capacity when there is one', () => {
    expect(attendanceLabel(5, 30)).toEqual({ text: '5 de 30 asistentes', isFull: false });
  });

  it('counts people without a capacity', () => {
    expect(attendanceLabel(0, null).text).toBe('Aún sin asistentes');
    expect(attendanceLabel(1, null).text).toBe('1 asistente');
    expect(attendanceLabel(7, 0).text).toBe('7 asistentes');
  });
});

describe('withoutBlocked', () => {
  it('drops what blocked people published', () => {
    const items = [collab({ id: 'a', authorId: 'ok' }), collab({ id: 'b', authorId: 'blocked' })];
    expect(
      withoutBlocked(items, (item) => item.authorId, new Set(['blocked'])).map((i) => i.id),
    ).toEqual(['a']);
  });
});
