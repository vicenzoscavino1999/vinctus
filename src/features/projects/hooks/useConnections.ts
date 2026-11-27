import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCollaborations,
  getSentCollaborationRequestIds,
  type CollaborationRead,
} from '@/features/collaborations/api';
import {
  getEventAttendeeCount,
  getUpcomingEvents,
  type FirestoreEvent,
} from '@/features/events/api';
import { getBlockedUsers } from '@/features/groups/api';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import {
  collaborationRelation,
  withoutBlocked,
  type CollaborationRelation,
} from '@/features/projects/model/connections';

export const UPCOMING_EVENTS_LIMIT = 12;

export type ConnectionsList<T> = {
  status: 'loading' | 'error' | 'ready';
  items: T[];
  /** Asks again ("Reintentar", or after publishing, editing or deleting). */
  reload: () => void;
};

const loadCollaborations = () => getCollaborations();
const loadEvents = () => getUpcomingEvents(UPCOMING_EVENTS_LIMIT);

/**
 * Everything Conexiones shows. Projects, encounters, the reader's blocked accounts and the
 * projects they already asked to join load at the same time and stay in memory for the session,
 * so coming back to the tab is instant. The blocked list is asked once for both lists.
 */
export function useConnections(uid: string | null) {
  // A failure only means nobody is hidden; the lists still load.
  const blocked = useSessionResource(uid ? `blocked:${uid}` : null, () =>
    uid ? getBlockedUsers(uid).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  );
  const collaborations = useSessionResource('connections:collaborations', loadCollaborations);
  const events = useSessionResource('connections:events', loadEvents);
  // Kept functional if it fails: the buttons then just offer "Solicitar".
  const sent = useSessionResource(uid ? `connections:sent:${uid}` : null, () =>
    uid ? getSentCollaborationRequestIds(uid) : Promise.resolve([] as string[]),
  );
  const [justRequested, setJustRequested] = useState<{ uid: string | null; ids: string[] }>({
    uid,
    ids: [],
  });

  // Wait for the blocked list, so a blocked person's post never shows for a moment.
  const blockedReady = !uid || blocked.data !== undefined;
  const blockedSet = useMemo(() => new Set(blocked.data ?? []), [blocked.data]);

  const collaborationList = useMemo(
    () =>
      toList(
        collaborations.data,
        collaborations.error,
        collaborations.reload,
        blockedReady,
        (items) => withoutBlocked(items, (item) => item.authorId, blockedSet),
      ),
    [collaborations.data, collaborations.error, collaborations.reload, blockedReady, blockedSet],
  );
  const eventList = useMemo(
    () =>
      toList(events.data, events.error, events.reload, blockedReady, (items) =>
        withoutBlocked(items, (event) => event.createdBy, blockedSet),
      ),
    [events.data, events.error, events.reload, blockedReady, blockedSet],
  );

  const requestedIds = useMemo(
    () => new Set([...(sent.data ?? []), ...(justRequested.uid === uid ? justRequested.ids : [])]),
    [sent.data, justRequested, uid],
  );

  const relationOf = useCallback(
    (item: CollaborationRead): CollaborationRelation =>
      collaborationRelation(item, uid, requestedIds),
    [uid, requestedIds],
  );

  const reloadSent = sent.reload;
  const markRequested = useCallback(
    (collaborationId: string) => {
      setJustRequested((previous) => {
        const ids = previous.uid === uid ? previous.ids : [];
        return ids.includes(collaborationId) ? previous : { uid, ids: [...ids, collaborationId] };
      });
      // So the cached list knows it too when you come back later.
      reloadSent();
    },
    [uid, reloadSent],
  );

  const attendees = useAttendeeCounts(uid, eventList.items);

  return {
    collaborations: collaborationList,
    events: eventList,
    relationOf,
    isRequested: (collaborationId: string) => requestedIds.has(collaborationId),
    markRequested,
    ...attendees,
  };
}

function toList<T>(
  data: T[] | undefined,
  error: unknown,
  reload: () => void,
  blockedReady: boolean,
  visible: (items: T[]) => T[],
): ConnectionsList<T> {
  if (data !== undefined && blockedReady) return { status: 'ready', items: visible(data), reload };
  if (error && data === undefined) return { status: 'error', items: [], reload };
  return { status: 'loading', items: [], reload };
}

/**
 * Fresh attendee counts for the encounters shown, asked once per encounter. Reading attendees
 * needs a signed-in user, so signed out the stored count is shown.
 */
function useAttendeeCounts(uid: string | null, events: FirestoreEvent[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!uid || events.length === 0) return;
    const pending = events.filter((event) => !asked.current.has(event.id));
    if (pending.length === 0) return;
    pending.forEach((event) => asked.current.add(event.id));

    // Not cancelled when the list changes: each count is asked only once, so it must land.
    void Promise.allSettled(
      pending.map(async (event) => [event.id, await getEventAttendeeCount(event.id)] as const),
    ).then((results) => {
      const updates: Record<string, number> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled') updates[result.value[0]] = result.value[1];
      });
      if (mounted.current && Object.keys(updates).length > 0) {
        setCounts((previous) => ({ ...previous, ...updates }));
      }
    });
  }, [uid, events]);

  const attendeeCount = useCallback(
    (event: FirestoreEvent) => counts[event.id] ?? event.attendeesCount ?? 0,
    [counts],
  );
  const setAttendeeCount = useCallback((eventId: string, count: number) => {
    setCounts((previous) => ({ ...previous, [eventId]: count }));
  }, []);

  return { attendeeCount, setAttendeeCount };
}
