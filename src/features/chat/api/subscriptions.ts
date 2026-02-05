import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { trackFirestoreListener, trackFirestoreRead } from '@/shared/lib/devMetrics';
import { AppError, toAppError } from '@/shared/lib/errors';

import type { ConversationRead, MessageAttachmentRead, MessageRead } from './types';

const SMALL_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_DIRECT_CONVERSATIONS_LIMIT = 200;
const DEFAULT_MESSAGES_LIMIT = 50;

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
};

const normalizeNullableString = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
};

const isRetryableError = (error: AppError): boolean => {
  if (error.code === 'NETWORK' || error.code === 'TIMEOUT') return true;

  const externalCode =
    typeof error.context?.externalCode === 'string' ? error.context.externalCode : null;
  if (!externalCode) return false;

  return (
    externalCode === 'unavailable' ||
    externalCode === 'deadline-exceeded' ||
    externalCode === 'resource-exhausted' ||
    externalCode === 'aborted' ||
    externalCode === 'internal' ||
    externalCode === 'cancelled'
  );
};

type SubscribeWithBackoffOptions = {
  source: string;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  notifyOnRetryable?: boolean;
  onError?: (error: AppError) => void;
};

const subscribeWithBackoff = (
  start: (handlers: { onError: (error: unknown) => void; onHealthy: () => void }) => Unsubscribe,
  options: SubscribeWithBackoffOptions,
): Unsubscribe => {
  const baseBackoffMs = options.baseBackoffMs ?? 250;
  const maxBackoffMs = options.maxBackoffMs ?? 8000;
  const notifyOnRetryable = options.notifyOnRetryable ?? false;

  let stopped = false;
  let attempt = 0;
  let currentUnsubscribe: Unsubscribe | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetryTimer = () => {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const stop = () => {
    stopped = true;
    clearRetryTimer();

    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }
  };

  const startListening = () => {
    if (stopped) return;

    clearRetryTimer();
    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }

    currentUnsubscribe = start({
      onHealthy: () => {
        attempt = 0;
      },
      onError: (error) => {
        const appError = toAppError(error, { context: { source: options.source } });
        const retryable = isRetryableError(appError);

        if (options.onError && (notifyOnRetryable || !retryable)) {
          options.onError(appError);
        } else {
          // Keep the console noise local to the subscription implementation.
          console.warn(`[${options.source}] Snapshot error`, appError);
        }

        if (!retryable) {
          stop();
          return;
        }

        if (stopped) return;
        if (retryTimer) return;

        const delay = Math.min(maxBackoffMs, baseBackoffMs * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          startListening();
        }, delay);
      },
    });
  };

  startListening();
  return stop;
};

const trackSnapshot = (source: string, snapshot: unknown): void => {
  if (typeof snapshot === 'object' && snapshot !== null && 'size' in snapshot) {
    const size = (snapshot as { size?: unknown }).size;
    if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
      trackFirestoreRead(source, size);
      return;
    }
  }
  trackFirestoreRead(source);
};

const buildConversation = (
  id: string,
  data: unknown,
  fallbackType: ConversationRead['type'],
): ConversationRead => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  const rawType = record.type;
  const type: ConversationRead['type'] =
    rawType === 'group' || rawType === 'direct' ? rawType : fallbackType;

  const groupId =
    typeof record.groupId === 'string'
      ? record.groupId
      : id.startsWith('grp_')
        ? id.slice(4)
        : undefined;

  const memberIds = Array.isArray(record.memberIds)
    ? record.memberIds.filter((item): item is string => typeof item === 'string')
    : undefined;

  const lastMessageRecord =
    typeof record.lastMessage === 'object' && record.lastMessage !== null
      ? (record.lastMessage as Record<string, unknown>)
      : null;

  const lastMessage: ConversationRead['lastMessage'] = lastMessageRecord
    ? {
        text: typeof lastMessageRecord.text === 'string' ? lastMessageRecord.text : '',
        senderId: typeof lastMessageRecord.senderId === 'string' ? lastMessageRecord.senderId : '',
        senderName: normalizeNullableString(lastMessageRecord.senderName),
        senderPhotoURL: normalizeNullableString(lastMessageRecord.senderPhotoURL),
        createdAt: toDate(lastMessageRecord.createdAt) ?? new Date(),
        clientCreatedAt:
          typeof lastMessageRecord.clientCreatedAt === 'number'
            ? lastMessageRecord.clientCreatedAt
            : 0,
      }
    : null;

  return {
    id,
    type,
    groupId,
    memberIds,
    lastMessage,
    createdAt: toDate(record.createdAt) ?? new Date(),
    updatedAt: toDate(record.updatedAt) ?? new Date(),
  };
};

const parseMessageAttachments = (value: unknown): MessageAttachmentRead[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const attachments: MessageAttachmentRead[] = [];
  value.forEach((raw) => {
    if (typeof raw !== 'object' || raw === null) return;
    const record = raw as Record<string, unknown>;

    const kind = record.kind === 'image' ? 'image' : record.kind === 'file' ? 'file' : null;
    if (!kind) return;

    const width =
      typeof record.width === 'number' ? record.width : record.width === null ? null : undefined;
    const height =
      typeof record.height === 'number' ? record.height : record.height === null ? null : undefined;

    attachments.push({
      kind,
      url: typeof record.url === 'string' ? record.url : '',
      thumbUrl:
        record.thumbUrl === null
          ? null
          : typeof record.thumbUrl === 'string'
            ? record.thumbUrl
            : undefined,
      path: typeof record.path === 'string' ? record.path : '',
      fileName: typeof record.fileName === 'string' ? record.fileName : '',
      contentType: typeof record.contentType === 'string' ? record.contentType : '',
      size: typeof record.size === 'number' ? record.size : 0,
      width,
      height,
    });
  });

  return attachments.length > 0 ? attachments : undefined;
};

const buildMessage = (id: string, data: unknown): MessageRead => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  return {
    id,
    senderId: typeof record.senderId === 'string' ? record.senderId : '',
    senderName: normalizeNullableString(record.senderName),
    senderPhotoURL: normalizeNullableString(record.senderPhotoURL),
    text: typeof record.text === 'string' ? record.text : '',
    attachments: parseMessageAttachments(record.attachments),
    createdAt: toDate(record.createdAt) ?? new Date(),
    clientCreatedAt: typeof record.clientCreatedAt === 'number' ? record.clientCreatedAt : 0,
    clientId: typeof record.clientId === 'string' ? record.clientId : id,
  };
};

export const subscribeToUserMemberships = (
  uid: string,
  onUpdate: (groupIds: string[]) => void,
  limitCount: number = SMALL_LIST_LIMIT,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  if (!uid) {
    onError?.(new AppError('VALIDATION_FAILED', 'Missing uid', { context: { uid } }));
    return () => {};
  }

  const safeLimit = clampInt(limitCount, SMALL_LIST_LIMIT, 1, MAX_LIST_LIMIT);
  const q = query(
    collection(db, 'users', uid, 'memberships'),
    orderBy('joinedAt', 'desc'),
    limit(safeLimit),
  );

  return subscribeWithBackoff(
    ({ onError: handleError, onHealthy }) =>
      trackFirestoreListener(
        'chat.subscribeToUserMemberships',
        onSnapshot(
          q,
          (snapshot) => {
            onHealthy();
            trackSnapshot('chat.subscribeToUserMemberships', snapshot);
            onUpdate(snapshot.docs.map((docSnap) => docSnap.id));
          },
          handleError,
        ),
      ),
    {
      source: 'chat.subscribeToUserMemberships',
      onError: (error) => onError?.(error),
    },
  );
};

const subscribeToUserDirectConversations = (
  uid: string,
  onUpdate: (conversationIds: string[]) => void,
  limitCount: number = DEFAULT_DIRECT_CONVERSATIONS_LIMIT,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  if (!uid) {
    onError?.(new AppError('VALIDATION_FAILED', 'Missing uid', { context: { uid } }));
    return () => {};
  }

  const safeLimit = clampInt(limitCount, DEFAULT_DIRECT_CONVERSATIONS_LIMIT, 1, MAX_LIST_LIMIT);
  const q = query(
    collection(db, 'users', uid, 'directConversations'),
    orderBy('updatedAt', 'desc'),
    limit(safeLimit),
  );

  return subscribeWithBackoff(
    ({ onError: handleError, onHealthy }) =>
      trackFirestoreListener(
        'chat.subscribeToUserDirectConversations',
        onSnapshot(
          q,
          (snapshot) => {
            onHealthy();
            trackSnapshot('chat.subscribeToUserDirectConversations', snapshot);
            onUpdate(snapshot.docs.map((docSnap) => docSnap.id));
          },
          handleError,
        ),
      ),
    {
      source: 'chat.subscribeToUserDirectConversations',
      onError: (error) => onError?.(error),
    },
  );
};

export const subscribeToConversations = (
  uid: string,
  callback: (conversations: ConversationRead[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  if (!uid) {
    onError?.(new AppError('VALIDATION_FAILED', 'Missing uid', { context: { uid } }));
    return () => {};
  }

  let stopped = false;
  let emitQueued = false;

  const conversationMap = new Map<string, ConversationRead>();
  const conversationUnsubs = new Map<string, Unsubscribe>();
  const directConversationIds = new Set<string>();
  const groupConversationIds = new Set<string>();

  const emit = () => {
    if (stopped) return;
    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    callback(conversations);
  };

  const scheduleEmit = () => {
    if (stopped) return;
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => {
      emitQueued = false;
      emit();
    });
  };

  const unsubscribeConversation = (conversationId: string) => {
    const unsubscribe = conversationUnsubs.get(conversationId);
    if (unsubscribe) unsubscribe();
    conversationUnsubs.delete(conversationId);
    conversationMap.delete(conversationId);
  };

  const subscribeToConversation = (
    conversationId: string,
    fallbackType: ConversationRead['type'],
  ) => {
    if (conversationUnsubs.has(conversationId)) return;

    const convRef = doc(db, 'conversations', conversationId);
    const stop = subscribeWithBackoff(
      ({ onError: handleError, onHealthy }) =>
        trackFirestoreListener(
          'chat.subscribeToConversation',
          onSnapshot(
            convRef,
            (convSnap) => {
              onHealthy();
              trackFirestoreRead('chat.subscribeToConversation');

              if (!convSnap.exists()) {
                conversationMap.delete(conversationId);
                scheduleEmit();
                return;
              }

              conversationMap.set(
                conversationId,
                buildConversation(conversationId, convSnap.data(), fallbackType),
              );
              scheduleEmit();
            },
            handleError,
          ),
        ),
      {
        source: 'chat.subscribeToConversation',
        onError: (error) => {
          unsubscribeConversation(conversationId);
          scheduleEmit();
          onError?.(error);
        },
      },
    );

    conversationUnsubs.set(conversationId, stop);
  };

  const handleFatalError = (error: unknown) => {
    onError?.(error);
  };

  const unsubscribeDirectIndex = subscribeToUserDirectConversations(
    uid,
    (conversationIds) => {
      const nextIds = new Set(conversationIds.filter((id) => id.startsWith('dm_')));

      nextIds.forEach((conversationId) => subscribeToConversation(conversationId, 'direct'));

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
      scheduleEmit();
    },
    DEFAULT_DIRECT_CONVERSATIONS_LIMIT,
    handleFatalError,
  );

  const unsubscribeMemberships = subscribeToUserMemberships(
    uid,
    (groupIds) => {
      const nextIds = new Set(groupIds.map((groupId) => `grp_${groupId}`));

      nextIds.forEach((conversationId) => subscribeToConversation(conversationId, 'group'));

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
      scheduleEmit();
    },
    MAX_LIST_LIMIT,
    handleFatalError,
  );

  return () => {
    stopped = true;

    unsubscribeDirectIndex();
    unsubscribeMemberships();

    conversationUnsubs.forEach((unsubscribe) => unsubscribe());
    conversationUnsubs.clear();
    conversationMap.clear();
    directConversationIds.clear();
    groupConversationIds.clear();
  };
};

export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: MessageRead[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  if (!conversationId) {
    onError?.(
      new AppError('VALIDATION_FAILED', 'Missing conversationId', { context: { conversationId } }),
    );
    return () => {};
  }

  const q = query(
    collection(db, `conversations/${conversationId}/messages`),
    orderBy('clientCreatedAt', 'desc'),
    limit(DEFAULT_MESSAGES_LIMIT),
  );

  return subscribeWithBackoff(
    ({ onError: handleError, onHealthy }) =>
      trackFirestoreListener(
        'chat.subscribeToMessages',
        onSnapshot(
          q,
          (snapshot) => {
            onHealthy();
            trackSnapshot('chat.subscribeToMessages', snapshot);
            callback(snapshot.docs.map((docSnap) => buildMessage(docSnap.id, docSnap.data())));
          },
          handleError,
        ),
      ),
    {
      source: 'chat.subscribeToMessages',
      onError: (error) => onError?.(error),
    },
  );
};
