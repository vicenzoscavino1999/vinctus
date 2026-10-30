import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  getCollectionItems,
  getRecentCollectionItems,
  getUserCollections,
} from '@/features/collections/api';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

describe('Collections API (emulator) - queries', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
    if (auth.currentUser) {
      await signOut(auth);
    }
  });

  afterAll(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    await cleanupRulesTestEnv();
  });

  it('gets user collections with limit and sort', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}/collections/c1`, {
      name: 'Coleccion vieja',
      icon: 'folder',
      itemCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/collections/c2`, {
      name: 'Coleccion nueva',
      icon: 'star',
      itemCount: 2,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/collections/c3`, {
      name: 'Coleccion extra',
      icon: null,
      itemCount: 3,
      createdAt: new Date('2026-01-03T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });

    const collections = await getUserCollections(uid, 2);

    expect(collections).toHaveLength(2);
    expect(collections[0]?.name).toBe('Coleccion extra');
    expect(collections[1]?.name).toBe('Coleccion nueva');
  });

  it('gets collection items with newest first', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}/collections/coll_1`, {
      name: 'Coleccion',
      icon: 'folder',
      itemCount: 2,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await seedDoc(`users/${uid}/collections/coll_1/items/i1`, {
      ownerId: uid,
      collectionId: 'coll_1',
      collectionName: 'Coleccion',
      type: 'note',
      title: 'Nota 1',
      url: null,
      text: 'contenido',
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/collections/coll_1/items/i2`, {
      ownerId: uid,
      collectionId: 'coll_1',
      collectionName: 'Coleccion',
      type: 'link',
      title: 'Link 2',
      url: 'https://example.com',
      text: null,
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const items = await getCollectionItems(uid, 'coll_1', 10);

    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('i2');
    expect(items[1]?.id).toBe('i1');
  });

  it('gets recent collection items through collection-group query', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}/collections/coll_a`, {
      name: 'A',
      icon: null,
      itemCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/collections/coll_b`, {
      name: 'B',
      icon: null,
      itemCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-04T00:00:00Z'),
    });

    await seedDoc(`users/${uid}/collections/coll_a/items/a1`, {
      ownerId: uid,
      collectionId: 'coll_a',
      collectionName: 'A',
      type: 'note',
      title: 'Nota A',
      url: null,
      text: 'A',
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/collections/coll_b/items/b1`, {
      ownerId: uid,
      collectionId: 'coll_b',
      collectionName: 'B',
      type: 'note',
      title: 'Nota B',
      url: null,
      text: 'B',
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
      createdAt: new Date('2026-01-03T00:00:00Z'),
    });

    const recent = await getRecentCollectionItems(uid, 2);

    expect(recent).toHaveLength(2);
    expect(recent[0]?.id).toBe('b1');
    expect(recent[1]?.id).toBe('a1');
  });

  it('validates query inputs with AppError', async () => {
    await expect(getUserCollections('', 5)).rejects.toSatisfy(isAppError);
    await expect(getCollectionItems('uid_1', '', 5)).rejects.toSatisfy(isAppError);
  });
});
