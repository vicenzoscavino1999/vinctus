import { describe, expect, it } from 'vitest';
import { appliedLikeCount, legacyCategoryFields, planPostKarma } from './postEngagementCounts';

describe('post karma calculation', () => {
  it('adjusts only the changed contribution and keeps existing historical points', () => {
    expect(
      planPostKarma({ karmaGlobal: 17, karmaByInterest: { science: 4, music: 13 } }, 'science', -1),
    ).toEqual({
      karmaGlobal: 15,
      reputation: 15,
      karmaByInterest: { science: 2, music: 13 },
    });
  });
  it('moves literal legacy fields into the real map without adding a category twice', () => {
    const data = {
      reputation: 10,
      karmaByInterest: { science: 4 },
      'karmaByInterest.science': 2,
      'karmaByInterest.history.modern': 6,
    };
    expect(planPostKarma(data, 'science', 1)).toEqual({
      karmaGlobal: 12,
      reputation: 12,
      karmaByInterest: { science: 6, 'history.modern': 6 },
    });
    expect(legacyCategoryFields(data)).toEqual([
      'karmaByInterest.science',
      'karmaByInterest.history.modern',
    ]);
  });
  it('caps reputation while preserving karma above the cap and never goes negative', () => {
    expect(planPostKarma({ karmaGlobal: 150 }, null, 1)).toMatchObject({
      karmaGlobal: 152,
      reputation: 100,
    });
    expect(
      planPostKarma({ karmaGlobal: 0, karmaByInterest: { science: 0 } }, 'science', -1),
    ).toMatchObject({ karmaGlobal: 0, reputation: 0, karmaByInterest: { science: 0 } });
  });
  it('treats category IDs as literal map keys, including dotted or special keys', () => {
    const fields = planPostKarma({ karmaGlobal: 0 }, '__proto__', 1);
    expect(Object.keys(fields.karmaByInterest)).toEqual(['__proto__']);
    expect(fields.karmaByInterest.__proto__).toBe(2);
    expect(Object.getPrototypeOf(fields.karmaByInterest)).toBeNull();
  });
  it('uses the previous server counter as the applied contribution and handles invalid numbers', () => {
    expect(appliedLikeCount({ likesCount: 3, likeCount: 8 })).toBe(3);
    expect(appliedLikeCount({ likeCount: 4 })).toBe(4);
    expect(appliedLikeCount({ likesCount: NaN, likeCount: 2 })).toBe(2);
    expect(
      planPostKarma(
        { karmaGlobal: NaN, reputation: 6, karmaByInterest: { science: Infinity } },
        'science',
        0,
      ),
    ).toMatchObject({ karmaGlobal: 6, reputation: 6, karmaByInterest: { science: 0 } });
  });
});
