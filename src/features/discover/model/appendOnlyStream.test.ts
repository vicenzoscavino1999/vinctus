import { describe, expect, it } from 'vitest';
import { appendToStream, type AppendOnlyStream } from './appendOnlyStream';

type Item = { id: string };

const key = (item: Item) => item.id;
const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const ids = (stream: AppendOnlyStream<Item>) => stream.items.map((item) => item.id);
const empty: AppendOnlyStream<Item> = { scope: 'feed', items: [] };

describe('appendToStream', () => {
  it('fills an empty stream up to the target count', () => {
    const next = appendToStream(empty, 'feed', items('a', 'b', 'c'), 2, key);

    expect(ids(next)).toEqual(['a', 'b']);
  });

  it('keeps shown items in place when new ones are inserted before them in the candidates', () => {
    // The mixed feed recomputes as [community..., youtube..., editorial...], so a post loaded
    // later lands in the middle of the candidate list. It must go after what was already shown.
    const shown = appendToStream(empty, 'feed', items('post1', 'yt1', 'ed1'), 3, key);
    const next = appendToStream(
      shown,
      'feed',
      items('post1', 'post2', 'yt1', 'yt2', 'ed2'),
      6,
      key,
    );

    expect(ids(next)).toEqual(['post1', 'yt1', 'ed1', 'post2', 'yt2', 'ed2']);
  });

  it('keeps items that are no longer among the candidates', () => {
    const shown = appendToStream(empty, 'feed', items('ed1', 'ed2'), 2, key);
    const next = appendToStream(shown, 'feed', items('post1', 'ed7'), 4, key);

    expect(ids(next)).toEqual(['ed1', 'ed2', 'post1', 'ed7']);
  });

  it('returns the same stream when nothing new fits, so render-time updates settle', () => {
    const shown = appendToStream(empty, 'feed', items('a', 'b'), 2, key);

    expect(appendToStream(shown, 'feed', items('a', 'b', 'c'), 2, key)).toBe(shown);
    expect(appendToStream(shown, 'feed', items('a'), 4, key)).toBe(shown);
  });

  it('starts over when the scope changes', () => {
    const shown = appendToStream(empty, 'feed', items('a', 'b'), 2, key);
    const next = appendToStream(shown, 'search:rock', items('x', 'a'), 2, key);

    expect(next).toEqual({ scope: 'search:rock', items: items('x', 'a') });
    expect(appendToStream(next, 'search:rock', items('x', 'a'), 2, key)).toBe(next);
  });
});
