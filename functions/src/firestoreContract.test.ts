// The part of the generated contract that only the Cloud Functions get. The rest is checked
// against the rules in src/shared/lib/firestore/firestoreContract.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVER_COLLECTIONS, storagePrefix } from './firestoreContract';

const contract = JSON.parse(
  readFileSync(new URL('../../shared/firestore-contract.json', import.meta.url), 'utf8'),
) as { serverCollections: Record<string, string> };

describe('Cloud Functions contract', () => {
  it('has the server collections of the contract', () => {
    expect(SERVER_COLLECTIONS).toEqual(contract.serverCollections);
  });

  it('gives the folders to delete', () => {
    expect(storagePrefix('profileAvatar', { userId: 'u1' })).toBe('profiles/u1/');
    expect(storagePrefix('groupIcon', { userId: 'u1', groupId: 'g1' })).toBe('groups/u1/g1/');
    expect(storagePrefix('conversationThumbnail', { conversationId: 'c1', userId: 'u1' })).toBe(
      'conversations/c1/thumbnails/u1/',
    );
  });

  it('refuses a missing or broken id instead of a wider folder', () => {
    expect(() => storagePrefix('postImage', {})).toThrow();
    expect(() => storagePrefix('postImage', { userId: '' })).toThrow();
    expect(() => storagePrefix('postImage', { userId: 'a/b' })).toThrow();
  });
});
