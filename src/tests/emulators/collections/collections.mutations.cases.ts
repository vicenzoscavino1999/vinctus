import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  createCollection,
  createCollectionItem,
  deleteCollection,
  deleteCollectionItem,
  updateCollection,
} from '@/features/collections/api';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const env = await getRulesTestEnv();
  let result: Record<string, unknown> | null = null;

  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(path).get();
    result = snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
  });

  return result;
}

describe('Collections API (emulator) - mutations', () => {
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

  it('creates and updates a collection', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const collectionId = await createCollection(uid, {
      name: 'Lecturas',
      icon: 'book',
    });

    const created = await readDoc(`users/${uid}/collections/${collectionId}`);
    expect(created).not.toBeNull();
    expect(created?.name).toBe('Lecturas');
    expect(created?.itemCount).toBe(0);

    await updateCollection(uid, collectionId, {
      name: 'Lecturas 2026',
      icon: 'star',
    });

    const updated = await readDoc(`users/${uid}/collections/${collectionId}`);
    expect(updated?.name).toBe('Lecturas 2026');
    expect(updated?.icon).toBe('star');
  });

  it('creates and deletes collection items while syncing itemCount', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const collectionId = await createCollection(uid, {
      name: 'Recursos',
      icon: 'folder',
    });

    const itemId = await createCollectionItem(uid, collectionId, {
      collectionName: 'Recursos',
      type: 'link',
      title: 'Documentacion',
      url: 'https://firebase.google.com',
      text: null,
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
    });

    const createdItem = await readDoc(`users/${uid}/collections/${collectionId}/items/${itemId}`);
    expect(createdItem).not.toBeNull();
    expect(createdItem?.title).toBe('Documentacion');

    const collectionAfterCreate = await readDoc(`users/${uid}/collections/${collectionId}`);
    expect(collectionAfterCreate?.itemCount).toBe(1);

    await deleteCollectionItem(uid, collectionId, itemId);
    await expect(
      readDoc(`users/${uid}/collections/${collectionId}/items/${itemId}`),
    ).resolves.toBeNull();

    const collectionAfterDelete = await readDoc(`users/${uid}/collections/${collectionId}`);
    expect(collectionAfterDelete?.itemCount).toBe(0);
  });

  it('deletes a collection document', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const collectionId = await createCollection(uid, {
      name: 'Temporal',
      icon: null,
    });

    await deleteCollection(uid, collectionId);
    await expect(readDoc(`users/${uid}/collections/${collectionId}`)).resolves.toBeNull();
  });

  it('validates collection item file input', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const collectionId = await createCollection(uid, {
      name: 'Archivos',
      icon: 'folder',
    });

    await expect(
      createCollectionItem(uid, collectionId, {
        collectionName: 'Archivos',
        type: 'file',
        title: 'CV',
        url: 'https://files.example.com/cv.pdf',
        fileName: null,
        fileSize: null,
        contentType: null,
        storagePath: null,
      }),
    ).rejects.toSatisfy(isAppError);
  });
});
