import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import type {
  CreateCollectionInput,
  CreateCollectionItemInput,
  CollectionItemType,
  UpdateCollectionInput,
} from './types';

const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable();

const collectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: nullableText(40).optional(),
});

const itemTypeSchema = z.enum(['link', 'note', 'file']) satisfies z.ZodType<CollectionItemType>;

const collectionItemInputSchema = z
  .object({
    collectionName: z.string().trim().min(1).max(80),
    type: itemTypeSchema,
    title: z.string().trim().min(1).max(160),
    url: nullableText(600).optional(),
    text: nullableText(2000).optional(),
    fileName: nullableText(200).optional(),
    fileSize: z.number().int().min(1).max(26_214_400).nullable().optional(),
    contentType: nullableText(120).optional(),
    storagePath: nullableText(600).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.type === 'link' && !input.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Link items must include url',
        path: ['url'],
      });
    }

    if (input.type === 'note' && !input.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Note items must include text',
        path: ['text'],
      });
    }

    if (input.type === 'file' && !input.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'File items must include url',
        path: ['url'],
      });
    }

    if (
      input.type === 'link' &&
      (input.text || input.fileName || input.fileSize || input.contentType || input.storagePath)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Link items cannot include note or file fields',
      });
    }

    if (
      input.type === 'note' &&
      (input.url || input.fileName || input.fileSize || input.contentType || input.storagePath)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Note items cannot include link or file fields',
      });
    }

    if (input.type === 'file') {
      if (!input.fileName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File items must include fileName',
          path: ['fileName'],
        });
      }
      if (!input.fileSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File items must include fileSize',
          path: ['fileSize'],
        });
      }
      if (!input.contentType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File items must include contentType',
          path: ['contentType'],
        });
      }
      if (!input.storagePath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File items must include storagePath',
          path: ['storagePath'],
        });
      }
      if (input.text) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File items cannot include note text',
          path: ['text'],
        });
      }
    }
  });

export const createCollection = async (
  uid: string,
  input: CreateCollectionInput,
): Promise<string> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeInput = validate(collectionInputSchema, input, {
    context: { op: 'collections.createCollection', uid: safeUid },
  });

  const collectionRef = doc(collection(db, 'users', safeUid, 'collections'));

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            collectionRef,
            {
              name: safeInput.name,
              icon: safeInput.icon ?? null,
              itemCount: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'collections.createCollection', uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'collections.createCollection', uid: safeUid } },
    );

    trackFirestoreWrite('collections.createCollection');
    return collectionRef.id;
  } catch (error) {
    throw toAppError(error, { context: { op: 'collections.createCollection', uid: safeUid } });
  }
};

export const updateCollection = async (
  uid: string,
  collectionId: string,
  input: UpdateCollectionInput,
): Promise<void> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeCollectionId = validate(firestoreIdSchema, collectionId, { context: { collectionId } });
  const safeInput = validate(collectionInputSchema, input, {
    context: {
      op: 'collections.updateCollection',
      uid: safeUid,
      collectionId: safeCollectionId,
    },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'users', safeUid, 'collections', safeCollectionId), {
            name: safeInput.name,
            icon: safeInput.icon ?? null,
            updatedAt: serverTimestamp(),
          }),
        {
          context: {
            op: 'collections.updateCollection',
            uid: safeUid,
            collectionId: safeCollectionId,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collections.updateCollection',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      },
    );

    trackFirestoreWrite('collections.updateCollection');
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collections.updateCollection',
        uid: safeUid,
        collectionId: safeCollectionId,
      },
    });
  }
};

export const deleteCollection = async (uid: string, collectionId: string): Promise<void> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeCollectionId = validate(firestoreIdSchema, collectionId, { context: { collectionId } });

  try {
    await withTimeout(
      withRetry(() => deleteDoc(doc(db, 'users', safeUid, 'collections', safeCollectionId)), {
        context: {
          op: 'collections.deleteCollection',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collections.deleteCollection',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      },
    );

    trackFirestoreWrite('collections.deleteCollection');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'collections.deleteCollection', uid: safeUid, collectionId: safeCollectionId },
    });
  }
};

export const createCollectionItem = async (
  uid: string,
  collectionId: string,
  input: CreateCollectionItemInput,
): Promise<string> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeCollectionId = validate(firestoreIdSchema, collectionId, { context: { collectionId } });
  const safeInput = validate(collectionItemInputSchema, input, {
    context: {
      op: 'collections.createCollectionItem',
      uid: safeUid,
      collectionId: safeCollectionId,
    },
  });

  const itemRef = doc(collection(db, 'users', safeUid, 'collections', safeCollectionId, 'items'));
  const collectionRef = doc(db, 'users', safeUid, 'collections', safeCollectionId);

  try {
    const batch = writeBatch(db);
    batch.set(
      itemRef,
      {
        ownerId: safeUid,
        collectionId: safeCollectionId,
        collectionName: safeInput.collectionName,
        type: safeInput.type,
        title: safeInput.title,
        url: safeInput.url ?? null,
        text: safeInput.text ?? null,
        fileName: safeInput.fileName ?? null,
        fileSize: safeInput.fileSize ?? null,
        contentType: safeInput.contentType ?? null,
        storagePath: safeInput.storagePath ?? null,
        createdAt: serverTimestamp(),
      },
      { merge: false },
    );
    batch.update(collectionRef, {
      itemCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: {
          op: 'collections.createCollectionItem',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collections.createCollectionItem',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      },
    );

    trackFirestoreWrite('collections.createCollectionItem', 2);
    return itemRef.id;
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collections.createCollectionItem',
        uid: safeUid,
        collectionId: safeCollectionId,
      },
    });
  }
};

export const deleteCollectionItem = async (
  uid: string,
  collectionId: string,
  itemId: string,
): Promise<void> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeCollectionId = validate(firestoreIdSchema, collectionId, { context: { collectionId } });
  const safeItemId = validate(firestoreIdSchema, itemId, { context: { itemId } });

  const itemRef = doc(db, 'users', safeUid, 'collections', safeCollectionId, 'items', safeItemId);
  const collectionRef = doc(db, 'users', safeUid, 'collections', safeCollectionId);

  try {
    const itemSnap = await withTimeout(
      withRetry(() => getDoc(itemRef), {
        context: {
          op: 'collections.deleteCollectionItem.getItem',
          uid: safeUid,
          collectionId: safeCollectionId,
          itemId: safeItemId,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'collections.deleteCollectionItem.getItem',
          uid: safeUid,
          collectionId: safeCollectionId,
          itemId: safeItemId,
        },
      },
    );

    trackFirestoreRead('collections.deleteCollectionItem.getItem');

    if (!itemSnap.exists()) return;

    const batch = writeBatch(db);
    batch.delete(itemRef);
    batch.update(collectionRef, {
      itemCount: increment(-1),
      updatedAt: serverTimestamp(),
    });

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: {
          op: 'collections.deleteCollectionItem.commit',
          uid: safeUid,
          collectionId: safeCollectionId,
          itemId: safeItemId,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collections.deleteCollectionItem.commit',
          uid: safeUid,
          collectionId: safeCollectionId,
          itemId: safeItemId,
        },
      },
    );

    trackFirestoreWrite('collections.deleteCollectionItem', 2);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collections.deleteCollectionItem',
        uid: safeUid,
        collectionId: safeCollectionId,
        itemId: safeItemId,
      },
    });
  }
};
