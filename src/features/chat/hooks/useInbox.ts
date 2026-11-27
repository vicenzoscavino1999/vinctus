import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBlockedUsers,
  getGroup,
  getUserProfile,
  subscribeToConversations,
  subscribeToUserMemberships,
  type ConversationRead,
  type FirestoreGroup,
} from '@/features/chat/api';
import { otherMemberOf, placeholderConversation } from '@/features/chat/model/inbox';

type GroupInfo = { name: string; iconUrl?: string };
type PersonInfo = { name: string; photoURL: string | null };

const DIRECT_PROFILE_PREFETCH_LIMIT = 50;

export type InboxStatus = 'loading' | 'ready' | 'error';

/**
 * The signed-in person's conversations, kept live, with what the list and the chat header need to
 * show them: group names and icons, the other person's name and photo, who is blocked, and the
 * groups they belong to. `openConversationId` is a conversation opened by link that may not be in
 * the list yet; it is included so its name still loads.
 */
export function useInbox(uid: string | null, openConversationId: string | null) {
  const [subscribed, setSubscribed] = useState<ConversationRead[]>([]);
  const [status, setStatus] = useState<InboxStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [groupInfo, setGroupInfo] = useState<Record<string, GroupInfo>>({});
  const groupInfoRef = useRef<Record<string, GroupInfo>>({});
  const [people, setPeople] = useState<Record<string, PersonInfo>>({});
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [memberGroups, setMemberGroups] = useState<FirestoreGroup[]>([]);
  const memberGroupsRef = useRef<FirestoreGroup[]>([]);
  const [memberGroupsStatus, setMemberGroupsStatus] = useState<InboxStatus>('ready');
  const [memberGroupsError, setMemberGroupsError] = useState<string | null>(null);

  useEffect(() => {
    groupInfoRef.current = groupInfo;
  }, [groupInfo]);

  useEffect(() => {
    memberGroupsRef.current = memberGroups;
  }, [memberGroups]);

  const conversations = useMemo(() => {
    if (!openConversationId || subscribed.some((conv) => conv.id === openConversationId)) {
      return subscribed;
    }
    return [placeholderConversation(openConversationId, uid), ...subscribed];
  }, [subscribed, openConversationId, uid]);

  // Conversations, live. Each group's name and icon is asked once.
  useEffect(() => {
    if (!uid) {
      setSubscribed([]);
      setStatus('error');
      setError('Necesitas iniciar sesión para ver mensajes.');
      return;
    }

    setStatus('loading');
    setError(null);

    const unsubscribe = subscribeToConversations(
      uid,
      (convs) => {
        setSubscribed(convs);
        setError(null);
        setStatus('ready');

        convs.forEach(async (conv) => {
          const groupId = conv.groupId;
          if (conv.type !== 'group' || !groupId || groupInfoRef.current[groupId]) return;
          try {
            const known = memberGroupsRef.current.find((group) => group.id === groupId);
            const group = known ?? (await getGroup(groupId));
            if (group) {
              setGroupInfo((prev) => ({
                ...prev,
                [groupId]: { name: group.name, iconUrl: group.iconUrl ?? undefined },
              }));
            }
          } catch (e) {
            console.error('Error fetching group info:', e);
          }
        });
      },
      (err) => {
        console.error('Error loading conversations:', err);
        setStatus('error');
        setError('No se pudieron cargar conversaciones.');
      },
    );

    return () => unsubscribe();
  }, [uid]);

  // The groups the person belongs to, live.
  useEffect(() => {
    if (!uid) {
      setMemberGroups([]);
      setMemberGroupsError(null);
      setMemberGroupsStatus('ready');
      return;
    }

    let isActive = true;
    let requestId = 0;

    const unsubscribe = subscribeToUserMemberships(
      uid,
      (groupIds) => {
        requestId += 1;
        const currentRequest = requestId;
        setMemberGroupsStatus('loading');
        setMemberGroupsError(null);

        void (async () => {
          try {
            const existingById = new Map(
              memberGroupsRef.current.map((group) => [group.id, group] as const),
            );
            const reused: FirestoreGroup[] = [];
            const missingIds: string[] = [];
            Array.from(new Set(groupIds)).forEach((groupId) => {
              const existing = existingById.get(groupId);
              if (existing) reused.push(existing);
              else missingIds.push(groupId);
            });

            const fetched =
              missingIds.length > 0 ? await Promise.all(missingIds.map((id) => getGroup(id))) : [];
            if (!isActive || currentRequest !== requestId) return;

            const resolved = [...reused, ...(fetched.filter(Boolean) as FirestoreGroup[])];
            setMemberGroups(resolved);
            setMemberGroupsStatus('ready');
            setGroupInfo((prev) => {
              const next = { ...prev };
              resolved.forEach((group) => {
                next[group.id] = { name: group.name, iconUrl: group.iconUrl ?? undefined };
              });
              return next;
            });
          } catch (loadError) {
            console.error('Error loading member groups:', loadError);
            if (!isActive || currentRequest !== requestId) return;
            setMemberGroups([]);
            setMemberGroupsError('No se pudieron cargar tus grupos.');
            setMemberGroupsStatus('error');
          }
        })();
      },
      null,
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [uid]);

  // People the person blocked: their direct chats and messages are hidden.
  useEffect(() => {
    if (!uid) {
      setBlockedUsers(new Set());
      return;
    }
    let isActive = true;
    void getBlockedUsers(uid)
      .then((ids) => {
        if (isActive) setBlockedUsers(new Set(ids));
      })
      .catch((err) => console.error('Error loading blocked users:', err));
    return () => {
      isActive = false;
    };
  }, [uid]);

  // Name and photo of the other person in direct chats, asked once each.
  useEffect(() => {
    if (!uid || conversations.length === 0) return;
    const missing = new Set<string>();
    conversations
      .filter((conv) => conv.type === 'direct')
      .slice(0, DIRECT_PROFILE_PREFETCH_LIMIT)
      .forEach((conv) => {
        const otherId = otherMemberOf(conv, uid);
        if (otherId && !people[otherId]) missing.add(otherId);
      });

    missing.forEach((personId) => {
      void (async () => {
        try {
          const profile = await getUserProfile(personId);
          if (!profile) return;
          setPeople((prev) =>
            prev[personId]
              ? prev
              : {
                  ...prev,
                  [personId]: {
                    name: profile.displayName ?? 'Usuario',
                    photoURL: profile.photoURL ?? null,
                  },
                },
          );
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      })();
    });
  }, [conversations, uid, people]);

  const nameOf = useCallback(
    (conv: ConversationRead): string => {
      if (conv.type === 'group' && conv.groupId) {
        return groupInfo[conv.groupId]?.name || conv.groupId;
      }
      const otherId = otherMemberOf(conv, uid);
      return (otherId && people[otherId]?.name) || 'Mensaje Directo';
    },
    [groupInfo, people, uid],
  );

  /** False while a group's name is still loading (its id would show instead). */
  const isNameReady = useCallback(
    (conv: ConversationRead): boolean =>
      conv.type !== 'group' || !conv.groupId || !!groupInfo[conv.groupId]?.name,
    [groupInfo],
  );

  const photoOf = useCallback(
    (conv: ConversationRead): string | null => {
      if (conv.type === 'group') return (conv.groupId && groupInfo[conv.groupId]?.iconUrl) || null;
      const otherId = otherMemberOf(conv, uid);
      return (otherId && people[otherId]?.photoURL) || null;
    },
    [groupInfo, people, uid],
  );

  /** A direct chat with someone the person blocked. */
  const isHidden = useCallback(
    (conv: ConversationRead): boolean => {
      const otherId = otherMemberOf(conv, uid);
      return !!otherId && blockedUsers.has(otherId);
    },
    [blockedUsers, uid],
  );

  const conversationFor = useCallback(
    (id: string): ConversationRead =>
      conversations.find((conv) => conv.id === id) ?? placeholderConversation(id, uid),
    [conversations, uid],
  );

  /** A group the person just created shows at once, before the membership update arrives. */
  const addCreatedGroup = useCallback(async (groupId: string) => {
    try {
      const created = await getGroup(groupId);
      if (!created) return;
      setMemberGroups((prev) =>
        prev.some((group) => group.id === created.id) ? prev : [created, ...prev],
      );
      setGroupInfo((prev) => ({
        ...prev,
        [created.id]: { name: created.name, iconUrl: created.iconUrl ?? undefined },
      }));
    } catch (refreshError) {
      console.error('Error refreshing group list:', refreshError);
    }
  }, []);

  return {
    conversations,
    status,
    error,
    blockedUsers,
    memberGroups,
    memberGroupsStatus,
    memberGroupsError,
    nameOf,
    isNameReady,
    photoOf,
    isHidden,
    conversationFor,
    addCreatedGroup,
  };
}

export type Inbox = ReturnType<typeof useInbox>;
