import {
  collection,
  doc,
  getDoc as _getDoc,
  limit,
  onSnapshot as _onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  Timestamp,
  updateDoc as _updateDoc,
  writeBatch,
  type FieldValue,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  trackFirestoreListener,
  trackFirestoreRead,
  trackFirestoreWrite,
} from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const SMALL_LIST_LIMIT = 50;

const resolveSnapshotSize = (value: unknown): number => {
  if (typeof value !== 'object' || value === null || !('size' in value)) return 1;
  const size = (value as { size?: unknown }).size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return 1;
  return Math.max(1, Math.floor(size));
};

const trackSnapshotRead = (snapshot: unknown): void => {
  trackFirestoreRead('firestore.onSnapshot', resolveSnapshotSize(snapshot));
};

const wrapSnapshotHandler = (handler: unknown): unknown => {
  if (typeof handler !== 'function') return handler;

  return (snapshot: unknown, ...rest: unknown[]) => {
    trackSnapshotRead(snapshot);
    return (handler as (...args: unknown[]) => unknown)(snapshot, ...rest);
  };
};

const wrapSnapshotObserver = (observer: unknown): unknown => {
  if (typeof observer !== 'object' || observer === null || !('next' in observer)) {
    return observer;
  }
  const next = (observer as { next?: unknown }).next;
  if (typeof next !== 'function') return observer;

  const typedObserver = observer as {
    next: (snapshot: unknown, ...rest: unknown[]) => unknown;
  };

  return {
    ...typedObserver,
    next: (snapshot: unknown, ...rest: unknown[]) => {
      trackSnapshotRead(snapshot);
      return typedObserver.next(snapshot, ...rest);
    },
  };
};

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const observeSnapshot = ((...args: unknown[]) => {
  const wrappedArgs = [...args];
  if (wrappedArgs.length > 1) {
    const rawSecond = wrappedArgs[1];
    const maybeObserver = wrapSnapshotObserver(rawSecond);
    wrappedArgs[1] = maybeObserver;

    if (maybeObserver === rawSecond) {
      wrappedArgs[1] = wrapSnapshotHandler(rawSecond);
    }
  }

  if (wrappedArgs.length > 2) {
    wrappedArgs[2] = wrapSnapshotHandler(wrappedArgs[2]);
  }

  const unsubscribe = (_onSnapshot as (...innerArgs: unknown[]) => Unsubscribe)(...wrappedArgs);
  return trackFirestoreListener('firestore.onSnapshot', unsubscribe);
}) as typeof _onSnapshot;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export interface ConversationRead {
  id: string;
  type: 'direct' | 'group';
  groupId?: string;
  memberIds?: string[];
  lastMessage: {
    text: string;
    senderId: string;
    senderName?: string | null;
    senderPhotoURL?: string | null;
    createdAt: Date;
    clientCreatedAt: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMemberRead {
  uid: string;
  role: 'member' | 'admin';
  joinedAt: Date;
  lastReadClientAt: number;
  lastReadAt: Date;
  muted: boolean;
  mutedUntil?: Date | null;
}

export interface MessageRead {
  id: string;
  senderId: string;
  senderName?: string | null;
  senderPhotoURL?: string | null;
  text: string;
  attachments?: MessageAttachmentRead[];
  createdAt: Date;
  clientCreatedAt: number;
  clientId: string;
}

export interface TypingIndicatorRead {
  uid: string;
  isTyping: boolean;
  updatedAt: Date;
}

interface ConversationWrite {
  type: 'direct' | 'group';
  groupId?: string;
  memberIds?: string[];
  lastMessage: {
    text: string;
    senderId: string;
    senderName?: string | null;
    senderPhotoURL?: string | null;
    createdAt: FieldValue;
    clientCreatedAt: number;
  } | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

interface ConversationMemberWrite {
  uid: string;
  role: 'member' | 'admin';
  joinedAt: FieldValue;
  lastReadClientAt: number;
  lastReadAt: FieldValue;
  muted: boolean;
  mutedUntil: FieldValue | Date | null;
}

interface MessageWrite {
  senderId: string;
  senderName?: string | null;
  senderPhotoURL?: string | null;
  text: string;
  attachments?: MessageAttachmentWrite[];
  createdAt: FieldValue;
  clientCreatedAt: number;
  clientId: string;
}

interface TypingIndicatorWrite {
  isTyping: boolean;
  updatedAt: FieldValue;
}

export type MessageAttachmentKind = 'image' | 'file';

export interface MessageAttachmentRead {
  kind: MessageAttachmentKind;
  url: string;
  thumbUrl?: string | null;
  path: string;
  fileName: string;
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
}

export interface MessageAttachmentWrite extends MessageAttachmentRead {}

export const subscribeToUserMemberships = (
  uid: string,
  onUpdate: (groupIds: string[]) => void,
  limitCount: number = SMALL_LIST_LIMIT,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'memberships'),
    orderBy('joinedAt', 'desc'),
    limit(limitCount),
  );

  return observeSnapshot(q, (snapshot) => {
    const groupIds = snapshot.docs.map((d) => d.id);
    onUpdate(groupIds);
  });
};

export const subscribeToUserDirectConversations = (
  uid: string,
  onUpdate: (conversationIds: string[]) => void,
  limitCount: number = 200,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'directConversations'),
    orderBy('updatedAt', 'desc'),
    limit(limitCount),
  );

  return observeSnapshot(
    q,
    (snapshot) => {
      const conversationIds = snapshot.docs.map((d) => d.id);
      onUpdate(conversationIds);
    },
    (error) => {
      console.error('Error subscribing to direct conversation index:', error);
      if (onError) {
        onError(error);
      }
    },
  );
};

const upsertDirectConversationIndex = async (
  uid: string,
  conversationId: string,
  otherUid: string,
): Promise<void> => {
  const indexRef = doc(db, 'users', uid, 'directConversations', conversationId);
  try {
    await setDoc(
      indexRef,
      {
        conversationId,
        otherUid,
        type: 'direct',
        updatedAt: serverTimestamp(),
      } as Record<string, unknown>,
      { merge: true },
    );
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }
};

/**
 * Get or create a direct conversation between two users
 * IDs are deterministic: dm_${sortedUids}
 */
export const getOrCreateDirectConversation = async (
  uid1: string,
  uid2: string,
): Promise<string> => {
  const memberIds = [uid1, uid2].sort();
  const conversationId = `dm_${memberIds.join('_')}`;
  const convRef = doc(db, 'conversations', conversationId);

  let convExists = false;
  try {
    const convSnap = await getDoc(convRef);
    convExists = convSnap.exists();
    if (convSnap.exists()) {
      const data = convSnap.data() as { memberIds?: unknown; type?: unknown } | undefined;
      const memberIdsValue = data?.memberIds;
      const hasMemberIds = Array.isArray(memberIdsValue) && memberIdsValue.length === 2;
      const hasType = data?.type === 'direct';
      if (!hasMemberIds || !hasType) {
        try {
          await updateDoc(convRef, {
            memberIds,
            type: 'direct',
            updatedAt: serverTimestamp(),
          });
        } catch (updateError) {
          const code = (updateError as { code?: string })?.code;
          if (code !== 'permission-denied') {
            throw updateError;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Conversation read blocked, attempting create:', error);
  }

  if (!convExists) {
    try {
      await setDoc(
        convRef,
        {
          type: 'direct',
          memberIds,
          lastMessage: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as ConversationWrite,
        { merge: false },
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'permission-denied') {
        throw error;
      }
    }
  }

  const memberRef1 = doc(db, `conversations/${conversationId}/members`, uid1);
  const memberRef2 = doc(db, `conversations/${conversationId}/members`, uid2);
  const [memberSnap1, memberSnap2] = await Promise.all([getDoc(memberRef1), getDoc(memberRef2)]);

  if (!memberSnap1.exists()) {
    await setDoc(
      memberRef1,
      {
        uid: uid1,
        role: 'member',
        joinedAt: serverTimestamp(),
        lastReadClientAt: Date.now(),
        lastReadAt: serverTimestamp(),
        muted: false,
        mutedUntil: null,
      } as ConversationMemberWrite,
      { merge: false },
    );
  }

  if (!memberSnap2.exists()) {
    await setDoc(
      memberRef2,
      {
        uid: uid2,
        role: 'member',
        joinedAt: serverTimestamp(),
        lastReadClientAt: Date.now(),
        lastReadAt: serverTimestamp(),
        muted: false,
        mutedUntil: null,
      } as ConversationMemberWrite,
      { merge: false },
    );
  }

  const [firstUid, secondUid] = memberIds;
  await Promise.all([
    upsertDirectConversationIndex(firstUid, conversationId, secondUid),
    upsertDirectConversationIndex(secondUid, conversationId, firstUid),
  ]);

  return conversationId;
};

/**
 * Get or create a group conversation
 * ID: grp_${groupId}
 */
export const getOrCreateGroupConversation = async (
  groupId: string,
  uid: string,
): Promise<string> => {
  const conversationId = `grp_${groupId}`;
  const convRef = doc(db, 'conversations', conversationId);

  let convExists = false;
  try {
    const convSnap = await getDoc(convRef);
    convExists = convSnap.exists();
  } catch (error) {
    console.warn('Group conversation read blocked, attempting create:', error);
  }

  if (!convExists) {
    try {
      await setDoc(
        convRef,
        {
          type: 'group',
          groupId,
          lastMessage: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as ConversationWrite,
        { merge: false },
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'permission-denied') {
        throw error;
      }
    }
  }

  const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) {
    await setDoc(
      memberRef,
      {
        uid,
        role: 'member',
        joinedAt: serverTimestamp(),
        lastReadClientAt: Date.now(),
        lastReadAt: serverTimestamp(),
        muted: false,
        mutedUntil: null,
      } as ConversationMemberWrite,
      { merge: false },
    );
  }

  return conversationId;
};

/**
 * Send a message to a conversation
 * Uses deterministic clientId for offline dedup
 */
export const sendMessage = async (
  conversationId: string,
  uid: string,
  text: string,
  senderName?: string | null,
  senderPhotoURL?: string | null,
  attachments?: MessageAttachmentWrite[],
  clientIdOverride?: string,
): Promise<void> => {
  const clientId =
    clientIdOverride ?? `${uid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const messageRef = doc(db, `conversations/${conversationId}/messages`, clientId);
  const convRef = doc(db, 'conversations', conversationId);

  const normalizedText = text ?? '';
  const normalizedAttachments = attachments && attachments.length > 0 ? attachments : undefined;

  const lastMessageText = (() => {
    if (normalizedText.trim()) {
      return normalizedText.trim();
    }
    if (!normalizedAttachments) {
      return '';
    }
    const imageCount = normalizedAttachments.filter((item) => item.kind === 'image').length;
    const fileCount = normalizedAttachments.length - imageCount;
    if (imageCount > 0 && fileCount > 0) {
      return 'Adjuntos';
    }
    if (imageCount > 0) {
      return imageCount === 1 ? 'Imagen' : 'Imagenes';
    }
    return fileCount === 1 ? 'Archivo' : 'Archivos';
  })();

  const batch = writeBatch(db);

  const messagePayload: MessageWrite = {
    senderId: uid,
    senderName: senderName ?? null,
    senderPhotoURL: senderPhotoURL ?? null,
    text: normalizedText,
    createdAt: serverTimestamp(),
    clientCreatedAt: Date.now(),
    clientId,
  };

  if (normalizedAttachments) {
    messagePayload.attachments = normalizedAttachments;
  }

  // Message (deterministic ID = offline dedup)
  batch.set(messageRef, messagePayload, { merge: false });

  // Update lastMessage
  batch.update(convRef, {
    lastMessage: {
      text: lastMessageText,
      senderId: uid,
      senderName: senderName ?? null,
      senderPhotoURL: senderPhotoURL ?? null,
      createdAt: serverTimestamp(),
      clientCreatedAt: Date.now(),
    },
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
};

/**
 * Subscribe to conversations for a user
 * Direct: query by memberIds
 * Group: resolve via user memberships
 */
export const subscribeToConversations = (
  uid: string,
  callback: (conversations: ConversationRead[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  const handleError = (error: unknown) => {
    console.error('Error subscribing to conversations:', error);
    if (onError) {
      onError(error);
    }
  };

  const conversationMap = new Map<string, ConversationRead>();
  const conversationUnsubs = new Map<string, Unsubscribe>();
  const directConversationIds = new Set<string>();
  const groupConversationIds = new Set<string>();

  const emit = () => {
    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    callback(conversations);
  };

  const buildConversation = (
    id: string,
    data: Record<string, unknown>,
    fallbackType: ConversationRead['type'],
  ): ConversationRead => {
    const rawType = data.type;
    const type = rawType === 'group' || rawType === 'direct' ? rawType : fallbackType;
    const groupId =
      typeof data.groupId === 'string'
        ? data.groupId
        : id.startsWith('grp_')
          ? id.slice(4)
          : undefined;
    const memberIds = Array.isArray(data.memberIds)
      ? data.memberIds.filter((item) => typeof item === 'string')
      : undefined;
    const lastMessageData = data.lastMessage as { createdAt?: unknown } | null | undefined;

    return {
      id,
      type,
      groupId,
      memberIds,
      lastMessage: lastMessageData
        ? {
            ...(lastMessageData as Record<string, unknown>),
            createdAt: toDate(lastMessageData.createdAt) || new Date(),
          }
        : null,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as ConversationRead;
  };

  const subscribeToConversation = (
    conversationId: string,
    fallbackType: ConversationRead['type'],
  ) => {
    if (conversationUnsubs.has(conversationId)) return;
    const convRef = doc(db, 'conversations', conversationId);
    const unsubscribe = observeSnapshot(
      convRef,
      (convSnap) => {
        if (!convSnap.exists()) {
          conversationMap.delete(conversationId);
          emit();
          return;
        }
        const data = convSnap.data() as Record<string, unknown>;
        conversationMap.set(conversationId, buildConversation(conversationId, data, fallbackType));
        emit();
      },
      (error) => {
        console.error(`Error subscribing to conversation ${conversationId}:`, error);
        unsubscribeConversation(conversationId);
        emit();
      },
    );
    conversationUnsubs.set(conversationId, unsubscribe);
  };

  const unsubscribeConversation = (conversationId: string) => {
    const unsubscribe = conversationUnsubs.get(conversationId);
    if (unsubscribe) {
      unsubscribe();
    }
    conversationUnsubs.delete(conversationId);
    conversationMap.delete(conversationId);
  };

  const unsubscribeDirectIndex = subscribeToUserDirectConversations(
    uid,
    (conversationIds) => {
      const nextIds = new Set(conversationIds.filter((id) => id.startsWith('dm_')));

      nextIds.forEach((conversationId) => {
        subscribeToConversation(conversationId, 'direct');
      });

      const toRemove: string[] = [];
      directConversationIds.forEach((conversationId) => {
        if (!nextIds.has(conversationId)) {
          toRemove.push(conversationId);
        }
      });
      toRemove.forEach((conversationId) => {
        directConversationIds.delete(conversationId);
        unsubscribeConversation(conversationId);
      });

      nextIds.forEach((conversationId) => directConversationIds.add(conversationId));
      emit();
    },
    200,
    handleError,
  );

  const unsubscribeMemberships = subscribeToUserMemberships(
    uid,
    (groupIds) => {
      const nextIds = new Set(groupIds.map((groupId) => `grp_${groupId}`));

      nextIds.forEach((conversationId) => {
        subscribeToConversation(conversationId, 'group');
      });

      const toRemove: string[] = [];
      groupConversationIds.forEach((conversationId) => {
        if (!nextIds.has(conversationId)) {
          toRemove.push(conversationId);
        }
      });
      toRemove.forEach((conversationId) => {
        groupConversationIds.delete(conversationId);
        unsubscribeConversation(conversationId);
      });

      nextIds.forEach((conversationId) => groupConversationIds.add(conversationId));
      emit();
    },
    200,
  );

  return () => {
    unsubscribeDirectIndex();
    unsubscribeMemberships();
    conversationUnsubs.forEach((unsubscribe) => unsubscribe());
    conversationUnsubs.clear();
    conversationMap.clear();
  };
};

/**
 * Subscribe to messages in a conversation
 * Ordered by clientCreatedAt (offline-safe)
 */
export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: MessageRead[]) => void,
): Unsubscribe => {
  const q = query(
    collection(db, `conversations/${conversationId}/messages`),
    orderBy('clientCreatedAt', 'desc'),
    limit(50),
  );

  return observeSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const attachments = Array.isArray(data.attachments)
        ? data.attachments.map((item: Record<string, unknown>) => ({
            kind: item.kind === 'image' ? 'image' : 'file',
            url: String(item.url || ''),
            thumbUrl: typeof item.thumbUrl === 'string' ? item.thumbUrl : null,
            path: String(item.path || ''),
            fileName: String(item.fileName || ''),
            contentType: String(item.contentType || ''),
            size: Number(item.size || 0),
            width: typeof item.width === 'number' ? item.width : null,
            height: typeof item.height === 'number' ? item.height : null,
          }))
        : undefined;
      return {
        id: docSnap.id,
        senderId: data.senderId,
        senderName: data.senderName ?? null,
        senderPhotoURL: data.senderPhotoURL ?? null,
        text: typeof data.text === 'string' ? data.text : '',
        attachments,
        createdAt: toDate(data.createdAt) || new Date(),
        clientCreatedAt: data.clientCreatedAt,
        clientId: data.clientId,
      } as MessageRead;
    });
    callback(messages);
  });
};

export const markConversationRead = async (conversationId: string, uid: string): Promise<void> => {
  const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
  try {
    await writeBatch(db)
      .update(memberRef, {
        lastReadClientAt: Date.now(),
        lastReadAt: serverTimestamp(),
      })
      .commit();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'not-found') {
      console.error('Error marking conversation read:', error);
      return;
    }
    try {
      await setDoc(
        memberRef,
        {
          uid,
          role: 'member',
          joinedAt: serverTimestamp(),
          lastReadClientAt: Date.now(),
          lastReadAt: serverTimestamp(),
          muted: false,
          mutedUntil: null,
        } as ConversationMemberWrite,
        { merge: false },
      );
    } catch (createError) {
      console.error('Error creating conversation member:', createError);
    }
  }
};

export const setTyping = async (
  conversationId: string,
  uid: string,
  isTyping: boolean,
): Promise<void> => {
  const typingRef = doc(db, `conversations/${conversationId}/typing`, uid);
  await writeBatch(db)
    .set(
      typingRef,
      {
        isTyping,
        updatedAt: serverTimestamp(),
      } as TypingIndicatorWrite,
      { merge: false },
    )
    .commit();
};

export const setConversationMute = async (
  conversationId: string,
  uid: string,
  mutedUntil: Date | null,
): Promise<void> => {
  const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
  await writeBatch(db)
    .update(memberRef, {
      muted: true,
      mutedUntil,
    })
    .commit();
};

export const clearConversationMute = async (conversationId: string, uid: string): Promise<void> => {
  const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
  await writeBatch(db)
    .update(memberRef, {
      muted: false,
      mutedUntil: null,
    })
    .commit();
};

export const getConversationMember = async (
  conversationId: string,
  uid: string,
): Promise<ConversationMemberRead | null> => {
  const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
    role: data.role,
    joinedAt: toDate(data.joinedAt) || new Date(),
    lastReadClientAt: data.lastReadClientAt,
    lastReadAt: toDate(data.lastReadAt) || new Date(),
    muted: data.muted ?? false,
    mutedUntil: data.mutedUntil ? toDate(data.mutedUntil) : null,
  } as ConversationMemberRead;
};

export const subscribeToTyping = (
  conversationId: string,
  callback: (typing: TypingIndicatorRead[]) => void,
): Unsubscribe => {
  const q = query(
    collection(db, `conversations/${conversationId}/typing`),
    orderBy('updatedAt', 'desc'),
    limit(SMALL_LIST_LIMIT),
  );

  return observeSnapshot(q, (snapshot) => {
    const typingList = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      ...docSnap.data(),
      updatedAt: toDate(docSnap.data().updatedAt) || new Date(),
    })) as TypingIndicatorRead[];
    callback(typingList.filter((t) => t.isTyping));
  });
};
