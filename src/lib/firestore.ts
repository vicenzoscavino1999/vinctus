// Firestore service layer for Vinctus
// Production-ready: offline-first writeBatch, correct types, chunking

import {
    collection,
    collectionGroup,
    doc,
    getDoc,
    getDocs,
    getCountFromServer,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    limitToLast,
    startAfter,
    startAt,
    endAt,
    onSnapshot,
    writeBatch,
    increment,
    serverTimestamp,
    Timestamp,
    type FieldValue,
    type DocumentSnapshot,
    type DocumentReference,
    type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

// ==================== Type Helpers ====================

/**
 * Convert Firestore Timestamp to JS Date
 */
const toDate = (value: unknown): Date | undefined => {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    return undefined;
};

// ==================== Read Types (from Firestore) ====================

export interface GroupMemberRead {
    uid: string;
    groupId: string;
    role: 'member' | 'moderator' | 'admin';
    joinedAt: Timestamp;
}

export interface UserMembershipRead {
    groupId: string;
    joinedAt: Timestamp;
}

export interface PostLikeRead {
    uid: string;
    postId: string;
    createdAt: Timestamp;
}

export interface UserLikeRead {
    postId: string;
    createdAt: Timestamp;
}

export interface SavedPostRead {
    postId: string;
    createdAt: Timestamp;
}

export interface SavedCategoryRead {
    categoryId: string;
    createdAt: Timestamp;
}

export interface PublicUserRead {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
}

// ==================== Activity Notifications ====================

export type ActivityType = 'post_like' | 'post_comment';

export interface ActivityRead {
    id: string;
    type: ActivityType;
    toUid: string;
    fromUid: string;
    fromUserName: string | null;
    fromUserPhoto: string | null;
    postId: string | null;
    postSnippet: string | null;
    commentText: string | null;
    createdAt: Date;
    read: boolean;
}

export interface ActivityWrite {
    type: ActivityType;
    toUid: string;
    fromUid: string;
    fromUserName: string | null;
    fromUserPhoto: string | null;
    postId: string | null;
    postSnippet: string | null;
    commentText: string | null;
    createdAt: FieldValue;
    read: boolean;
}

// Extended user profile data
export interface UserProfileRead {
    uid: string;
    displayName: string | null;
    displayNameLowercase: string | null;
    photoURL: string | null;
    email: string | null;
    bio: string | null;
    role: string | null;
    location: string | null;
    username: string | null;
    reputation: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserProfileUpdate {
    displayName?: string;
    bio?: string;
    role?: string;
    location?: string;
    username?: string;
}

// ==================== Write Types (to Firestore) ====================

export interface GroupMemberWrite {
    uid: string;
    groupId: string;
    role: 'member' | 'moderator' | 'admin';
    joinedAt: FieldValue;
}

export interface UserMembershipWrite {
    groupId: string;
    joinedAt: FieldValue;
}

export interface PostLikeWrite {
    uid: string;
    postId: string;
    createdAt: FieldValue;
}

export interface UserLikeWrite {
    postId: string;
    createdAt: FieldValue;
}

export interface SavedPostWrite {
    postId: string;
    createdAt: FieldValue;
}

export interface SavedCategoryWrite {
    categoryId: string;
    createdAt: FieldValue;
}

// ==================== Collections Types ====================

export type CollectionItemType = 'link' | 'note' | 'file';

export interface CollectionRead {
    id: string;
    name: string;
    icon: string | null;
    itemCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CollectionWrite {
    name: string;
    icon: string | null;
    itemCount: number;
    createdAt: FieldValue;
    updatedAt: FieldValue;
}

export interface CollectionItemRead {
    id: string;
    ownerId: string;
    collectionId: string;
    collectionName: string;
    type: CollectionItemType;
    title: string;
    url: string | null;
    text: string | null;
    fileName: string | null;
    fileSize: number | null;
    contentType: string | null;
    storagePath: string | null;
    createdAt: Date;
}

export interface CollectionItemWrite {
    ownerId: string;
    collectionId: string;
    collectionName: string;
    type: CollectionItemType;
    title: string;
    url: string | null;
    text: string | null;
    fileName: string | null;
    fileSize: number | null;
    contentType: string | null;
    storagePath: string | null;
    createdAt: FieldValue;
}

// ==================== Group Type ====================

export interface FirestoreGroup {
    id: string;
    name: string;
    description?: string | null;
    categoryId?: string | null;
    visibility?: GroupVisibility;
    ownerId?: string;
    iconUrl?: string | null;
    memberCount?: number;
    apiQuery?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export type GroupVisibility = 'public' | 'private';

// Pagination result
export interface PaginatedResult<T> {
    items: T[];
    lastDoc: DocumentSnapshot | null;
    hasMore: boolean;
}

// ==================== Constants ====================

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;
const BATCH_CHUNK_SIZE = 450; // Max 500, use 450 for safety
const ACTIVITY_SNIPPET_LIMIT = 160;

const notificationsCollection = collection(db, 'notifications');

const trimText = (value: string | null | undefined, limit = ACTIVITY_SNIPPET_LIMIT): string | null => {
    if (!value) return null;
    if (value.length <= limit) return value;
    return `${value.slice(0, limit).trim()}...`;
};

// ==================== Chunking Helper ====================

/**
 * Delete documents in chunks to avoid 500 write limit
 */
async function deleteInChunks(refs: DocumentReference[]): Promise<void> {
    for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = refs.slice(i, i + BATCH_CHUNK_SIZE);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

/**
 * Set documents in chunks to avoid 500 write limit
 */
async function setInChunks<T extends object>(
    items: Array<{ ref: DocumentReference; data: T }>
): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
        chunk.forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
    }
}

// ==================== Groups (Read) ====================

const groupsCollection = collection(db, 'groups');

export const getGroups = async (): Promise<FirestoreGroup[]> => {
    const snapshot = await getDocs(groupsCollection);
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
        } as FirestoreGroup;
    });
};

export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
    const q = query(groupsCollection, where('categoryId', '==', categoryId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
        } as FirestoreGroup;
    });
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
    const docSnap = await getDoc(doc(db, 'groups', groupId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as FirestoreGroup;
};

// ==================== Group Membership (Offline-First writeBatch) ====================

/**
 * Join a group - offline-first with writeBatch (no reads)
 * Cloud Function should handle memberCount increment on onCreate
 * 
 * Source of truth: groups/{groupId}/members/{uid}
 * User index: users/{uid}/memberships/{groupId}
 */
export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    const batch = writeBatch(db);

    // Source of truth
    batch.set(memberRef, {
        uid,
        groupId,
        role: 'member',
        joinedAt: serverTimestamp(),
    } as GroupMemberWrite, { merge: false });

    // User index
    batch.set(membershipRef, {
        groupId,
        joinedAt: serverTimestamp(),
    } as UserMembershipWrite, { merge: false });

    await batch.commit();
};

/**
 * Leave a group - offline-first delete
 * Cloud Function should handle memberCount decrement on onDelete
 */
export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    const batch = writeBatch(db);
    batch.delete(memberRef);
    batch.delete(membershipRef);
    await batch.commit();
};

/**
 * Check if user is member of group
 */
export const isGroupMember = async (groupId: string, uid: string): Promise<boolean> => {
    const docSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
    return docSnap.exists();
};

export interface CreateGroupInput {
    name: string;
    description: string;
    categoryId: string | null;
    visibility: GroupVisibility;
    iconUrl: string | null;
}

export async function createGroup(ownerId: string, input: CreateGroupInput): Promise<string> {
    const groupRef = doc(collection(db, 'groups'));
    const memberRef = doc(db, 'groups', groupRef.id, 'members', ownerId);
    const membershipRef = doc(db, 'users', ownerId, 'memberships', groupRef.id);
    await setDoc(groupRef, {
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        visibility: input.visibility,
        ownerId,
        iconUrl: input.iconUrl,
        memberCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    try {
        const batch = writeBatch(db);
        batch.set(memberRef, {
            uid: ownerId,
            groupId: groupRef.id,
            role: 'admin',
            joinedAt: serverTimestamp()
        } as GroupMemberWrite, { merge: false });
        batch.set(membershipRef, {
            groupId: groupRef.id,
            joinedAt: serverTimestamp()
        } as UserMembershipWrite, { merge: false });
        await batch.commit();
    } catch (error) {
        await deleteDoc(groupRef).catch(() => {});
        throw error;
    }

    return groupRef.id;
}

export async function updateGroup(groupId: string, input: CreateGroupInput): Promise<void> {
    await updateDoc(doc(db, 'groups', groupId), {
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        visibility: input.visibility,
        iconUrl: input.iconUrl,
        updatedAt: serverTimestamp()
    });
}

export async function joinPublicGroup(groupId: string, uid: string): Promise<void> {
    const group = await getGroup(groupId);
    if (!group) {
        throw new Error('Grupo no encontrado');
    }
    const visibility = group.visibility ?? 'public';
    if (visibility !== 'public') {
        throw new Error('Este grupo es privado');
    }
    await joinGroupWithSync(groupId, uid);
}

export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface GroupJoinRequestRead {
    id: string;
    groupId: string;
    groupName: string;
    fromUid: string;
    toUid: string;
    status: GroupJoinRequestStatus;
    message: string | null;
    fromUserName: string | null;
    fromUserPhoto: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function sendGroupJoinRequest(input: {
    groupId: string;
    groupName: string;
    fromUid: string;
    toUid: string;
    message: string | null;
    fromUserName: string | null;
    fromUserPhoto: string | null;
}): Promise<string> {
    const existingQuery = query(
        collection(db, 'group_requests'),
        where('fromUid', '==', input.fromUid),
        where('groupId', '==', input.groupId)
    );
    const existing = await getDocs(existingQuery);

    if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const data = existingDoc.data();
        if (data.status === 'pending') {
            throw new Error('Ya enviaste una solicitud para este grupo.');
        }
        if (data.status === 'accepted') {
            throw new Error('Ya eres miembro de este grupo.');
        }
    }

    const requestRef = doc(collection(db, 'group_requests'));
    await setDoc(requestRef, {
        groupId: input.groupId,
        groupName: input.groupName,
        fromUid: input.fromUid,
        toUid: input.toUid,
        status: 'pending',
        message: input.message,
        fromUserName: input.fromUserName,
        fromUserPhoto: input.fromUserPhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return requestRef.id;
}

export async function getPendingGroupJoinRequests(ownerId: string): Promise<GroupJoinRequestRead[]> {
    const q = query(
        collection(db, 'group_requests'),
        where('toUid', '==', ownerId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            groupId: data.groupId,
            groupName: data.groupName,
            fromUid: data.fromUid,
            toUid: data.toUid,
            status: (data.status as GroupJoinRequestStatus) || 'pending',
            message: data.message ?? null,
            fromUserName: data.fromUserName ?? null,
            fromUserPhoto: data.fromUserPhoto ?? null,
            createdAt: toDate(data.createdAt) || new Date(),
            updatedAt: toDate(data.updatedAt) || new Date()
        } as GroupJoinRequestRead;
    });
}

export async function acceptGroupJoinRequest(requestId: string): Promise<void> {
    const requestRef = doc(db, 'group_requests', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) {
        throw new Error('Solicitud no encontrada');
    }

    const data = requestSnap.data();
    if (data.status !== 'pending') return;

    const groupId = data.groupId as string;
    const memberUid = data.fromUid as string;

    const memberRef = doc(db, 'groups', groupId, 'members', memberUid);
    const membershipRef = doc(db, 'users', memberUid, 'memberships', groupId);

    const batch = writeBatch(db);
    batch.update(requestRef, {
        status: 'accepted',
        updatedAt: serverTimestamp()
    });
    batch.set(memberRef, {
        uid: memberUid,
        groupId,
        role: 'member',
        joinedAt: serverTimestamp()
    } as GroupMemberWrite, { merge: false });
    batch.set(membershipRef, {
        groupId,
        joinedAt: serverTimestamp()
    } as UserMembershipWrite, { merge: false });
    await batch.commit();
}

export async function rejectGroupJoinRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'group_requests', requestId), {
        status: 'rejected',
        updatedAt: serverTimestamp()
    });
}

// ==================== Events (Encuentros) ====================

export type EventVisibility = 'public' | 'private';

export interface FirestoreEvent {
    id: string;
    title: string;
    description: string | null;
    startAt: Date | null;
    endAt: Date | null;
    city: string | null;
    venue: string | null;
    capacity: number | null;
    attendeesCount: number | null;
    visibility: EventVisibility;
    createdBy: string;
    coverUrl: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface CreateEventInput {
    title: string;
    description: string | null;
    startAt: Date;
    endAt?: Date | null;
    city: string | null;
    venue: string | null;
    capacity: number | null;
    visibility: EventVisibility;
    coverUrl?: string | null;
}

export interface EventWrite {
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date | null;
    city: string | null;
    venue: string | null;
    capacity: number | null;
    visibility: EventVisibility;
    createdBy: string;
    coverUrl: string | null;
    createdAt: FieldValue;
    updatedAt: FieldValue;
}

export interface EventAttendeeRead {
    uid: string;
    joinedAt: Date;
}

export interface EventAttendeeWrite {
    uid: string;
    joinedAt: FieldValue;
}

export async function createEvent(ownerId: string, input: CreateEventInput): Promise<string> {
    const eventRef = doc(collection(db, 'events'));
    await setDoc(eventRef, {
        title: input.title,
        description: input.description,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        city: input.city,
        venue: input.venue,
        capacity: input.capacity,
        visibility: input.visibility,
        createdBy: ownerId,
        coverUrl: input.coverUrl ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    } as EventWrite, { merge: false });

    try {
        const attendeeRef = doc(db, 'events', eventRef.id, 'attendees', ownerId);
        await setDoc(attendeeRef, {
            uid: ownerId,
            joinedAt: serverTimestamp()
        } as EventAttendeeWrite, { merge: false });
    } catch (error) {
        await deleteDoc(eventRef).catch(() => {});
        throw error;
    }
    return eventRef.id;
}

export async function updateEvent(eventId: string, input: CreateEventInput): Promise<void> {
    await updateDoc(doc(db, 'events', eventId), {
        title: input.title,
        description: input.description,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        city: input.city,
        venue: input.venue,
        capacity: input.capacity,
        visibility: input.visibility,
        coverUrl: input.coverUrl ?? null,
        updatedAt: serverTimestamp()
    });
}

export async function getEvent(eventId: string): Promise<FirestoreEvent | null> {
    const snap = await getDoc(doc(db, 'events', eventId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
        id: snap.id,
        title: data.title,
        description: data.description ?? null,
        startAt: toDate(data.startAt) ?? null,
        endAt: toDate(data.endAt) ?? null,
        city: data.city ?? null,
        venue: data.venue ?? null,
        capacity: typeof data.capacity === 'number' ? data.capacity : null,
        attendeesCount: typeof data.attendeesCount === 'number' ? data.attendeesCount : null,
        visibility: (data.visibility as EventVisibility) ?? 'public',
        createdBy: data.createdBy,
        coverUrl: data.coverUrl ?? null,
        createdAt: toDate(data.createdAt) ?? null,
        updatedAt: toDate(data.updatedAt) ?? null
    };
}

export async function getUpcomingEvents(limitCount: number = DEFAULT_LIMIT): Promise<FirestoreEvent[]> {
    const upcomingQuery = query(
        collection(db, 'events'),
        where('visibility', '==', 'public'),
        where('startAt', '>=', Timestamp.now()),
        orderBy('startAt', 'asc'),
        limit(limitCount)
    );
    const upcomingSnap = await getDocs(upcomingQuery);
    const mapSnap = (snap: typeof upcomingSnap) => snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            title: data.title,
            description: data.description ?? null,
            startAt: toDate(data.startAt) ?? null,
            endAt: toDate(data.endAt) ?? null,
            city: data.city ?? null,
            venue: data.venue ?? null,
            capacity: typeof data.capacity === 'number' ? data.capacity : null,
            attendeesCount: typeof data.attendeesCount === 'number' ? data.attendeesCount : null,
            visibility: (data.visibility as EventVisibility) ?? 'public',
            createdBy: data.createdBy,
            coverUrl: data.coverUrl ?? null,
            createdAt: toDate(data.createdAt) ?? null,
            updatedAt: toDate(data.updatedAt) ?? null
        };
    });

    if (!upcomingSnap.empty) {
        return mapSnap(upcomingSnap);
    }

    const recentSnap = await getDocs(query(
        collection(db, 'events'),
        where('visibility', '==', 'public'),
        orderBy('startAt', 'asc'),
        limitToLast(limitCount)
    ));
    return mapSnap(recentSnap);
}

export async function joinEvent(eventId: string, uid: string): Promise<void> {
    const eventSnap = await getDoc(doc(db, 'events', eventId));
    if (!eventSnap.exists()) {
        throw new Error('Evento no encontrado');
    }
    const visibility = (eventSnap.data().visibility as EventVisibility) ?? 'public';
    if (visibility !== 'public') {
        throw new Error('Este evento es privado');
    }

    const attendeeRef = doc(db, 'events', eventId, 'attendees', uid);
    const attendeeSnap = await getDoc(attendeeRef);
    if (attendeeSnap.exists()) return;
    await setDoc(attendeeRef, {
        uid,
        joinedAt: serverTimestamp()
    } as EventAttendeeWrite, { merge: false });
}

export async function leaveEvent(eventId: string, uid: string): Promise<void> {
    await deleteDoc(doc(db, 'events', eventId, 'attendees', uid));
}

export async function deleteEvent(eventId: string): Promise<void> {
    await deleteDoc(doc(db, 'events', eventId));
}

export async function isEventAttendee(eventId: string, uid: string): Promise<boolean> {
    const snap = await getDoc(doc(db, 'events', eventId, 'attendees', uid));
    return snap.exists();
}

export async function getEventAttendeeCount(eventId: string): Promise<number> {
    const snap = await getCountFromServer(collection(db, 'events', eventId, 'attendees'));
    return snap.data().count;
}

export type GroupJoinStatus = 'member' | 'pending' | 'none';

export async function getGroupJoinStatus(groupId: string, uid: string): Promise<GroupJoinStatus> {
    const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
    if (memberSnap.exists()) return 'member';

    const reqQuery = query(
        collection(db, 'group_requests'),
        where('groupId', '==', groupId),
        where('fromUid', '==', uid),
        where('status', '==', 'pending')
    );
    const reqSnap = await getDocs(reqQuery);
    return reqSnap.empty ? 'none' : 'pending';
}

export async function getGroupMemberCount(groupId: string): Promise<number> {
    const snap = await getCountFromServer(collection(db, 'groups', groupId, 'members'));
    return snap.data().count;
}

export async function getGroupMembers(groupId: string, limitCount: number = DEFAULT_LIMIT): Promise<GroupMemberRead[]> {
    const q = query(
        collection(db, 'groups', groupId, 'members'),
        orderBy('joinedAt', 'desc'),
        limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as { groupId?: string; role?: GroupMemberRead['role']; joinedAt?: Timestamp };
        return {
            uid: docSnap.id,
            groupId: data.groupId ?? groupId,
            role: data.role ?? 'member',
            joinedAt: data.joinedAt ?? Timestamp.now()
        };
    });
}

export async function getGroupPostsWeekCount(groupId: string): Promise<number> {
    const weekAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const q = query(
        collection(db, 'posts'),
        where('groupId', '==', groupId),
        where('createdAt', '>=', weekAgo)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

// ==================== Post Likes (Offline-First writeBatch) ====================

/**
 * Like a post - offline-first with writeBatch
 * Cloud Function should handle likesCount increment on onCreate
 * 
 * Source of truth: posts/{postId}/likes/{uid}
 * User index: users/{uid}/likes/{postId}
 */
export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const likeRef = doc(db, 'posts', postId, 'likes', uid);
    const userLikeRef = doc(db, 'users', uid, 'likes', postId);

    const batch = writeBatch(db);

    // Source of truth (for counting/triggers)
    batch.set(likeRef, {
        uid,
        postId,
        createdAt: serverTimestamp(),
    } as PostLikeWrite, { merge: false });

    // User index (for quick "my likes" queries)
    batch.set(userLikeRef, {
        postId,
        createdAt: serverTimestamp(),
    } as UserLikeWrite, { merge: false });

    await batch.commit();

    try {
        const post = await getPost(postId);
        if (!post) return;
        if (post.authorId === uid) return;
        const profile = await getUserProfile(uid);
        await createPostLikeActivity({
            postId,
            postAuthorId: post.authorId,
            postContent: post.content,
            fromUid: uid,
            fromUserName: profile?.displayName ?? null,
            fromUserPhoto: profile?.photoURL ?? null
        });
    } catch (error) {
        console.error('Error creating like activity:', error);
    }
};

/**
 * Unlike a post - offline-first delete
 * Cloud Function should handle likesCount decrement on onDelete
 */
export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const likeRef = doc(db, 'posts', postId, 'likes', uid);
    const userLikeRef = doc(db, 'users', uid, 'likes', postId);

    const batch = writeBatch(db);
    batch.delete(likeRef);
    batch.delete(userLikeRef);
    await batch.commit();
};

/**
 * Check if user liked a post
 */
export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
    const docSnap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
    return docSnap.exists();
};

// ==================== Post Comments ====================

export interface PostCommentRead {
    id: string;
    postId: string;
    authorId: string;
    authorSnapshot: {
        displayName: string;
        photoURL: string | null;
    };
    text: string;
    createdAt: Date;
}

export async function addPostComment(
    postId: string,
    authorId: string,
    authorSnapshot: { displayName: string; photoURL: string | null },
    text: string
): Promise<string> {
    const commentRef = doc(collection(db, 'posts', postId, 'comments'));
    await setDoc(commentRef, {
        postId,
        authorId,
        authorSnapshot,
        text,
        createdAt: serverTimestamp()
    });
    try {
        const post = await getPost(postId);
        if (post) {
            await createPostCommentActivity({
                postId,
                postAuthorId: post.authorId,
                postContent: post.content,
                commentText: text,
                fromUid: authorId,
                fromUserName: authorSnapshot.displayName,
                fromUserPhoto: authorSnapshot.photoURL
            });
        }
    } catch (error) {
        console.error('Error creating comment activity:', error);
    }
    return commentRef.id;
}

export async function getPostComments(
    postId: string,
    limitCount: number = 50,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<PostCommentRead>> {
    let q = query(
        collection(db, 'posts', postId, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(limitCount + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > limitCount;
    const docs = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

    const items = docs.map((docSnap) => {
        const data = docSnap.data();
        const createdAt = toDate(data.createdAt) || new Date();
        return {
            id: docSnap.id,
            postId: data.postId || postId,
            authorId: data.authorId || '',
            authorSnapshot: {
                displayName: data.authorSnapshot?.displayName || 'Usuario',
                photoURL: data.authorSnapshot?.photoURL || null
            },
            text: data.text || '',
            createdAt
        } as PostCommentRead;
    });

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

export async function getPostCommentCount(postId: string): Promise<number> {
    const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'comments'));
    return snapshot.data().count;
}

export async function getPostLikeCount(postId: string): Promise<number> {
    const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'likes'));
    return snapshot.data().count;
}

// ==================== Activity Feed ====================

export async function getUserActivity(
    uid: string,
    pageSize: number = DEFAULT_LIMIT,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<ActivityRead>> {
    let q = query(
        notificationsCollection,
        where('toUid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const items = docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            type: data.type as ActivityType,
            toUid: data.toUid,
            fromUid: data.fromUid,
            fromUserName: data.fromUserName ?? null,
            fromUserPhoto: data.fromUserPhoto ?? null,
            postId: data.postId ?? null,
            postSnippet: data.postSnippet ?? null,
            commentText: data.commentText ?? null,
            createdAt: toDate(data.createdAt) || new Date(),
            read: data.read === true
        } as ActivityRead;
    });

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

export async function createPostLikeActivity(input: {
    postId: string;
    postAuthorId: string;
    postContent: string | null;
    fromUid: string;
    fromUserName: string | null;
    fromUserPhoto: string | null;
}): Promise<void> {
    if (input.postAuthorId === input.fromUid) return;
    const docId = `like_${input.postId}_${input.fromUid}`;
    await setDoc(doc(notificationsCollection, docId), {
        type: 'post_like',
        toUid: input.postAuthorId,
        fromUid: input.fromUid,
        fromUserName: input.fromUserName ?? null,
        fromUserPhoto: input.fromUserPhoto ?? null,
        postId: input.postId,
        postSnippet: trimText(input.postContent),
        commentText: null,
        createdAt: serverTimestamp(),
        read: false
    } as ActivityWrite, { merge: true });
}

export async function createPostCommentActivity(input: {
    postId: string;
    postAuthorId: string;
    postContent: string | null;
    commentText: string;
    fromUid: string;
    fromUserName: string | null;
    fromUserPhoto: string | null;
}): Promise<string | null> {
    if (input.postAuthorId === input.fromUid) return null;
    const ref = doc(notificationsCollection);
    await setDoc(ref, {
        type: 'post_comment',
        toUid: input.postAuthorId,
        fromUid: input.fromUid,
        fromUserName: input.fromUserName ?? null,
        fromUserPhoto: input.fromUserPhoto ?? null,
        postId: input.postId,
        postSnippet: trimText(input.postContent),
        commentText: trimText(input.commentText, 220),
        createdAt: serverTimestamp(),
        read: false
    } as ActivityWrite);
    return ref.id;
}

// ==================== Saved Posts (Offline-First) ====================

/**
 * Save a post
 */
export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'savedPosts', postId), {
        postId,
        createdAt: serverTimestamp(),
    } as SavedPostWrite, { merge: false });
    await batch.commit();
};

/**
 * Unsave a post
 */
export const unsavePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'savedPosts', postId));
    await batch.commit();
};

/**
 * Check if post is saved
 */
export const isPostSaved = async (postId: string, uid: string): Promise<boolean> => {
    const docSnap = await getDoc(doc(db, 'users', uid, 'savedPosts', postId));
    return docSnap.exists();
};

// ==================== Saved Categories (Offline-First) ====================

/**
 * Save a category
 */
export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'savedCategories', categoryId), {
        categoryId,
        createdAt: serverTimestamp(),
    } as SavedCategoryWrite, { merge: false });
    await batch.commit();
};

/**
 * Unsave a category
 */
export const unsaveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'savedCategories', categoryId));
    await batch.commit();
};

/**
 * Check if category is saved
 */
export const isCategorySaved = async (categoryId: string, uid: string): Promise<boolean> => {
    const docSnap = await getDoc(doc(db, 'users', uid, 'savedCategories', categoryId));
    return docSnap.exists();
};

// ==================== Collections ====================

export const getUserCollections = async (uid: string): Promise<CollectionRead[]> => {
    const q = query(
        collection(db, 'users', uid, 'collections'),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            name: data.name,
            icon: data.icon ?? null,
            itemCount: typeof data.itemCount === 'number' ? data.itemCount : 0,
            createdAt: toDate(data.createdAt) ?? new Date(),
            updatedAt: toDate(data.updatedAt) ?? new Date()
        } as CollectionRead;
    });
};

export async function createCollection(uid: string, input: { name: string; icon?: string | null }): Promise<string> {
    const ref = doc(collection(db, 'users', uid, 'collections'));
    await setDoc(ref, {
        name: input.name,
        icon: input.icon ?? null,
        itemCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    } as CollectionWrite, { merge: false });
    return ref.id;
}

export async function updateCollection(uid: string, collectionId: string, input: { name: string; icon?: string | null }): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'collections', collectionId), {
        name: input.name,
        icon: input.icon ?? null,
        updatedAt: serverTimestamp()
    });
}

export async function deleteCollection(uid: string, collectionId: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'collections', collectionId));
}

export async function getCollectionItems(
    uid: string,
    collectionId: string,
    limitCount: number = DEFAULT_LIMIT
): Promise<CollectionItemRead[]> {
    const q = query(
        collection(db, 'users', uid, 'collections', collectionId, 'items'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ownerId: data.ownerId,
            collectionId: data.collectionId,
            collectionName: data.collectionName,
            type: data.type as CollectionItemType,
            title: data.title,
            url: data.url ?? null,
            text: data.text ?? null,
            fileName: data.fileName ?? null,
            fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
            contentType: data.contentType ?? null,
            storagePath: data.storagePath ?? null,
            createdAt: toDate(data.createdAt) ?? new Date()
        } as CollectionItemRead;
    });
}

export async function createCollectionItem(
    uid: string,
    collectionId: string,
    input: {
        collectionName: string;
        type: CollectionItemType;
        title: string;
        url?: string | null;
        text?: string | null;
        fileName?: string | null;
        fileSize?: number | null;
        contentType?: string | null;
        storagePath?: string | null;
    }
): Promise<string> {
    const itemRef = doc(collection(db, 'users', uid, 'collections', collectionId, 'items'));
    const collectionRef = doc(db, 'users', uid, 'collections', collectionId);
    const batch = writeBatch(db);
    batch.set(itemRef, {
        ownerId: uid,
        collectionId,
        collectionName: input.collectionName,
        type: input.type,
        title: input.title,
        url: input.url ?? null,
        text: input.text ?? null,
        fileName: input.fileName ?? null,
        fileSize: typeof input.fileSize === 'number' ? input.fileSize : null,
        contentType: input.contentType ?? null,
        storagePath: input.storagePath ?? null,
        createdAt: serverTimestamp()
    } as CollectionItemWrite, { merge: false });
    batch.update(collectionRef, {
        itemCount: increment(1),
        updatedAt: serverTimestamp()
    });
    await batch.commit();
    return itemRef.id;
}

export async function deleteCollectionItem(uid: string, collectionId: string, itemId: string): Promise<void> {
    const itemRef = doc(db, 'users', uid, 'collections', collectionId, 'items', itemId);
    const collectionRef = doc(db, 'users', uid, 'collections', collectionId);
    const batch = writeBatch(db);
    batch.delete(itemRef);
    batch.update(collectionRef, {
        itemCount: increment(-1),
        updatedAt: serverTimestamp()
    });
    await batch.commit();
}

export async function getRecentCollectionItems(uid: string, limitCount: number = SMALL_LIST_LIMIT): Promise<CollectionItemRead[]> {
    const q = query(
        collectionGroup(db, 'items'),
        where('ownerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ownerId: data.ownerId,
            collectionId: data.collectionId,
            collectionName: data.collectionName,
            type: data.type as CollectionItemType,
            title: data.title,
            url: data.url ?? null,
            text: data.text ?? null,
            fileName: data.fileName ?? null,
            fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
            contentType: data.contentType ?? null,
            storagePath: data.storagePath ?? null,
            createdAt: toDate(data.createdAt) ?? new Date()
        } as CollectionItemRead;
    });
}

// ==================== Real-time Subscriptions ====================

/**
 * Subscribe to user's memberships (first page only for realtime)
 */
export const subscribeToUserMemberships = (
    uid: string,
    onUpdate: (groupIds: string[]) => void,
    limitCount: number = SMALL_LIST_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'memberships'),
        orderBy('joinedAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const groupIds = snapshot.docs.map(d => d.id);
        onUpdate(groupIds);
    });
};

/**
 * Subscribe to user's saved categories
 */
export const subscribeToSavedCategories = (
    uid: string,
    onUpdate: (categoryIds: string[]) => void
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'savedCategories'),
        orderBy('createdAt', 'desc'),
        limit(SMALL_LIST_LIMIT)
    );

    return onSnapshot(q, (snapshot) => {
        const categoryIds = snapshot.docs.map(d => d.id);
        onUpdate(categoryIds);
    });
};

/**
 * Subscribe to user's liked posts (first page)
 */
export const subscribeToLikedPosts = (
    uid: string,
    onUpdate: (postIds: string[]) => void,
    limitCount: number = DEFAULT_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'likes'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const postIds = snapshot.docs.map(d => d.id);
        onUpdate(postIds);
    });
};

/**
 * Subscribe to user's saved posts (first page)
 */
export const subscribeToSavedPosts = (
    uid: string,
    onUpdate: (postIds: string[]) => void,
    limitCount: number = DEFAULT_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'savedPosts'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const postIds = snapshot.docs.map(d => d.id);
        onUpdate(postIds);
    });
};

// ==================== Paginated Queries (Load More - No Realtime) ====================

/**
 * Get user's memberships with pagination
 */
export const getUserMembershipsPaginated = async (
    uid: string,
    lastDoc?: DocumentSnapshot,
    pageSize: number = DEFAULT_LIMIT
): Promise<PaginatedResult<string>> => {
    let q = query(
        collection(db, 'users', uid, 'memberships'),
        orderBy('joinedAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

    return {
        items: docs.map(d => d.id),
        lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
        hasMore
    };
};

/**
 * Get user's liked posts with pagination
 */
export const getLikedPostsPaginated = async (
    uid: string,
    lastDoc?: DocumentSnapshot,
    pageSize: number = DEFAULT_LIMIT
): Promise<PaginatedResult<string>> => {
    let q = query(
        collection(db, 'users', uid, 'likes'),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

    return {
        items: docs.map(d => d.id),
        lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
        hasMore
    };
};

// ==================== Bulk Operations (with chunking) ====================

/**
 * Seed groups from mock data (chunked for >500 items)
 */
export const seedGroups = async (
    groups: Array<Omit<FirestoreGroup, 'id' | 'createdAt'>>
): Promise<void> => {
    const items = groups.map(group => ({
        ref: doc(collection(db, 'groups')),
        data: {
            ...group,
            memberCount: group.memberCount || 0,
            createdAt: serverTimestamp(),
        }
    }));

    await setInChunks(items);
};

/**
 * Clear all user data (chunked for users with many items)
 * 
 * ⚠️ WARNING: This is for TESTING ONLY!
 * 
 * Production issues:
 * - Only deletes user-side data (users/{uid}/...)
 * - Does NOT delete source-of-truth data (groups/{gid}/members/{uid}, posts/{pid}/likes/{uid})
 * - Leaves "zombie" data in Firestore
 * - Security Rules should prevent users from calling this on other UIDs
 * 
 * For production account deletion:
 * - Use Cloud Function with onUserDeleted trigger (Firebase Auth)
 * - Admin SDK can delete both sides of dual-write
 * - See: functions/src/index.ts (TODO: implement onUserDeleted)
 */
export const clearUserData = async (uid: string): Promise<void> => {
    const collections = ['memberships', 'likes', 'savedPosts', 'savedCategories'];
    const allRefs: DocumentReference[] = [];

    // Gather all document references
    for (const collName of collections) {
        const snapshot = await getDocs(collection(db, 'users', uid, collName));
        snapshot.docs.forEach(d => allRefs.push(d.ref));
    }

    // Delete in chunks
    if (allRefs.length > 0) {
        await deleteInChunks(allRefs);
    }
};

// ==================== Optimistic UI Helpers ====================

/**
 * Action result type for optimistic updates
 */
export interface OptimisticAction<T> {
    execute: () => Promise<void>;
    optimisticValue: T;
    rollbackValue: T;
}

/**
 * Create optimistic join action
 */
export const createOptimisticJoin = (
    groupId: string,
    uid: string,
    currentGroups: string[]
): OptimisticAction<string[]> => ({
    execute: () => joinGroupWithSync(groupId, uid),
    optimisticValue: [...currentGroups, groupId],
    rollbackValue: currentGroups,
});

/**
 * Create optimistic leave action
 */
export const createOptimisticLeave = (
    groupId: string,
    uid: string,
    currentGroups: string[]
): OptimisticAction<string[]> => ({
    execute: () => leaveGroupWithSync(groupId, uid),
    optimisticValue: currentGroups.filter(id => id !== groupId),
    rollbackValue: currentGroups,
});

/**
 * Create optimistic like action
 */
export const createOptimisticLike = (
    postId: string,
    uid: string,
    currentLikes: string[]
): OptimisticAction<string[]> => ({
    execute: () => likePostWithSync(postId, uid),
    optimisticValue: [...currentLikes, postId],
    rollbackValue: currentLikes,
});

/**
 * Create optimistic unlike action
 */
export const createOptimisticUnlike = (
    postId: string,
    uid: string,
    currentLikes: string[]
): OptimisticAction<string[]> => ({
    execute: () => unlikePostWithSync(postId, uid),
    optimisticValue: currentLikes.filter(id => id !== postId),
    rollbackValue: currentLikes,
});

// ==================== Messaging Types (Read) ====================

export interface ConversationRead {
    id: string;
    type: 'direct' | 'group';
    groupId?: string;
    memberIds?: string[];
    lastMessage: {
        text: string;
        senderId: string;
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
}

export interface MessageRead {
    id: string;
    senderId: string;
    text: string;
    createdAt: Date;
    clientCreatedAt: number;
    clientId: string;
}

export interface TypingIndicatorRead {
    uid: string;
    isTyping: boolean;
    updatedAt: Date;
}

// ==================== Messaging Types (Write) ====================

export interface ConversationWrite {
    type: 'direct' | 'group';
    groupId?: string;
    memberIds?: string[];
    lastMessage: {
        text: string;
        senderId: string;
        createdAt: FieldValue;
        clientCreatedAt: number;
    } | null;
    createdAt: FieldValue;
    updatedAt: FieldValue;
}

export interface ConversationMemberWrite {
    uid: string;
    role: 'member' | 'admin';
    joinedAt: FieldValue;
    lastReadClientAt: number;
    lastReadAt: FieldValue;
    muted: boolean;
}

export interface MessageWrite {
    senderId: string;
    text: string;
    createdAt: FieldValue;
    clientCreatedAt: number;
    clientId: string;
}

export interface TypingIndicatorWrite {
    isTyping: boolean;
    updatedAt: FieldValue;
}

// ==================== Messaging Functions ====================

/**
 * Get or create a direct conversation between two users
 * IDs are deterministic: dm_${sortedUids}
 */
export const getOrCreateDirectConversation = async (uid1: string, uid2: string): Promise<string> => {
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
                        updatedAt: serverTimestamp()
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
            await setDoc(convRef, {
                type: 'direct',
                memberIds,
                lastMessage: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            } as ConversationWrite, { merge: false });
        } catch (error) {
            const code = (error as { code?: string })?.code;
            if (code !== 'permission-denied') {
                throw error;
            }
        }
    }

    const memberRef1 = doc(db, `conversations/${conversationId}/members`, uid1);
    const memberRef2 = doc(db, `conversations/${conversationId}/members`, uid2);
    const [memberSnap1, memberSnap2] = await Promise.all([
        getDoc(memberRef1),
        getDoc(memberRef2)
    ]);

    if (!memberSnap1.exists()) {
        await setDoc(memberRef1, {
            uid: uid1,
            role: 'member',
            joinedAt: serverTimestamp(),
            lastReadClientAt: Date.now(),
            lastReadAt: serverTimestamp(),
            muted: false
        } as ConversationMemberWrite, { merge: false });
    }

    if (!memberSnap2.exists()) {
        await setDoc(memberRef2, {
            uid: uid2,
            role: 'member',
            joinedAt: serverTimestamp(),
            lastReadClientAt: Date.now(),
            lastReadAt: serverTimestamp(),
            muted: false
        } as ConversationMemberWrite, { merge: false });
    }

    return conversationId;
};

/**
 * Get or create a group conversation
 * ID: grp_${groupId}
 */
export const getOrCreateGroupConversation = async (groupId: string, uid: string): Promise<string> => {
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
            await setDoc(convRef, {
                type: 'group',
                groupId,
                lastMessage: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            } as ConversationWrite, { merge: false });
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
        await setDoc(memberRef, {
            uid,
            role: 'member',
            joinedAt: serverTimestamp(),
            lastReadClientAt: Date.now(),
            lastReadAt: serverTimestamp(),
            muted: false
        } as ConversationMemberWrite, { merge: false });
    }

    return conversationId;
};

/**
 * Send a message to a conversation
 * Uses deterministic clientId for offline dedup
 */
export const sendMessage = async (conversationId: string, uid: string, text: string): Promise<void> => {
    const clientId = `${uid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageRef = doc(db, `conversations/${conversationId}/messages`, clientId);
    const convRef = doc(db, 'conversations', conversationId);

    const batch = writeBatch(db);

    // Message (deterministic ID = offline dedup)
    batch.set(messageRef, {
        senderId: uid,
        text,
        createdAt: serverTimestamp(),
        clientCreatedAt: Date.now(),
        clientId
    } as MessageWrite, { merge: false });

    // Update lastMessage
    batch.update(convRef, {
        lastMessage: {
            text,
            senderId: uid,
            createdAt: serverTimestamp(),
            clientCreatedAt: Date.now()
        },
        updatedAt: serverTimestamp()
    });

    await batch.commit();
};

/**
 * Subscribe to conversations for a user
 * Note: Since we can't query across subcollections easily,
 * we subscribe to all conversations and filter on client
 */
export const subscribeToConversations = (
    uid: string,
    callback: (conversations: ConversationRead[]) => void,
    onError?: (error: unknown) => void
): Unsubscribe => {
    const handleError = (error: unknown) => {
        console.error('Error subscribing to conversations:', error);
        if (onError) {
            onError(error);
        }
    };

    const membersQuery = query(
        collectionGroup(db, 'members'),
        where('uid', '==', uid),
        limit(200)
    );

    const conversationMap = new Map<string, ConversationRead>();
    const conversationUnsubs = new Map<string, Unsubscribe>();

    const emit = () => {
        const conversations = Array.from(conversationMap.values()).sort(
            (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        callback(conversations);
    };

    const subscribeToConversation = (conversationId: string) => {
        if (conversationUnsubs.has(conversationId)) return;
        const convRef = doc(db, 'conversations', conversationId);
        const unsubscribe = onSnapshot(
            convRef,
            (convSnap) => {
                if (!convSnap.exists()) {
                    conversationMap.delete(conversationId);
                    emit();
                    return;
                }
                const data = convSnap.data();
                const conversation: ConversationRead = {
                    id: convSnap.id,
                    type: data.type,
                    groupId: data.groupId,
                    memberIds: data.memberIds || undefined,
                    lastMessage: data.lastMessage ? {
                        ...data.lastMessage,
                        createdAt: toDate(data.lastMessage.createdAt) || new Date()
                    } : null,
                    createdAt: toDate(data.createdAt) || new Date(),
                    updatedAt: toDate(data.updatedAt) || new Date()
                };
                conversationMap.set(conversationId, conversation);
                emit();
            },
            handleError
        );
        conversationUnsubs.set(conversationId, unsubscribe);
    };

    const unsubscribeMembers = onSnapshot(
        membersQuery,
        (snapshot) => {
            const nextIds = new Set<string>();
            snapshot.docs.forEach((memberDoc) => {
                const convId = memberDoc.ref.parent.parent?.id;
                if (convId) {
                    nextIds.add(convId);
                }
            });

            nextIds.forEach(subscribeToConversation);

            Array.from(conversationUnsubs.keys()).forEach((convId) => {
                if (nextIds.has(convId)) return;
                const unsubscribe = conversationUnsubs.get(convId);
                if (unsubscribe) {
                    unsubscribe();
                }
                conversationUnsubs.delete(convId);
                conversationMap.delete(convId);
            });

            emit();
        },
        handleError
    );

    return () => {
        unsubscribeMembers();
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
    callback: (messages: MessageRead[]) => void
): Unsubscribe => {
    const q = query(
        collection(db, `conversations/${conversationId}/messages`),
        orderBy('clientCreatedAt', 'desc'),
        limit(50)
    );

    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                senderId: data.senderId,
                text: data.text,
                createdAt: toDate(data.createdAt) || new Date(),
                clientCreatedAt: data.clientCreatedAt,
                clientId: data.clientId
            } as MessageRead;
        });
        callback(messages);
    });
};

/**
 * Mark conversation as read
 */
export const markConversationRead = async (conversationId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, `conversations/${conversationId}/members`, uid);
    try {
        await writeBatch(db).update(memberRef, {
            lastReadClientAt: Date.now(),
            lastReadAt: serverTimestamp()
        }).commit();
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'not-found') {
            console.error('Error marking conversation read:', error);
            return;
        }
        try {
            await setDoc(memberRef, {
                uid,
                role: 'member',
                joinedAt: serverTimestamp(),
                lastReadClientAt: Date.now(),
                lastReadAt: serverTimestamp(),
                muted: false
            } as ConversationMemberWrite, { merge: false });
        } catch (createError) {
            console.error('Error creating conversation member:', createError);
        }
    }
};

/**
 * Set typing indicator (call from UI with throttle)
 */
export const setTyping = async (conversationId: string, uid: string, isTyping: boolean): Promise<void> => {
    const typingRef = doc(db, `conversations/${conversationId}/typing`, uid);
    await writeBatch(db).set(typingRef, {
        isTyping,
        updatedAt: serverTimestamp()
    } as TypingIndicatorWrite, { merge: false }).commit();
};

/**
 * Subscribe to typing indicators
 */
export const subscribeToTyping = (
    conversationId: string,
    callback: (typing: TypingIndicatorRead[]) => void
): Unsubscribe => {
    const q = query(collection(db, `conversations/${conversationId}/typing`));

    return onSnapshot(q, (snapshot) => {
        const typingList = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data(),
            updatedAt: toDate(doc.data().updatedAt) || new Date()
        })) as TypingIndicatorRead[];
        callback(typingList.filter(t => t.isTyping));
    });
};


// ==================== User Search ====================

export const searchUsersByDisplayName = async (queryText: string, limitCount = 10): Promise<PublicUserRead[]> => {
    const normalized = queryText.trim().toLowerCase();
    if (!normalized) return [];

    const q = query(
        collection(db, 'users_public'),
        orderBy('displayNameLowercase'),
        startAt(normalized),
        endAt(`${normalized}\uf8ff`),
        limit(limitCount)
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as { displayName?: string | null; photoURL?: string | null };
        return {
            uid: docSnap.id,
            displayName: data.displayName ?? null,
            photoURL: data.photoURL ?? null
        };
    });
};

/**
 * Get recent/suggested users (for initial display on search page)
 * Returns users ordered by most recently updated
 */
export const getRecentUsers = async (limitCount = 15, excludeUid?: string): Promise<PublicUserRead[]> => {
    const q = query(
        collection(db, 'users_public'),
        orderBy('updatedAt', 'desc'),
        limit(limitCount + 1) // Fetch one extra in case we need to exclude current user
    );

    const snapshot = await getDocs(q);

    const users = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as { displayName?: string | null; photoURL?: string | null };
        return {
            uid: docSnap.id,
            displayName: data.displayName ?? null,
            photoURL: data.photoURL ?? null
        };
    });

    // Filter out current user and limit
    return users
        .filter(u => u.uid !== excludeUid)
        .slice(0, limitCount);
};

// ==================== Posts Types ====================

/**
 * Media attachment for posts
 */
export interface PostMedia {
    url: string;
    path: string;         // Storage path: posts/{authorId}/{postId}/(images|videos)/{filename}
    type: 'image' | 'video';
    contentType: string;
    width?: number;       // For CLS prevention
    height?: number;      // For CLS prevention
}

/**
 * Post read type (from Firestore)
 */
export interface PostRead {
    id: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorPhoto: string | null;
    content: string;
    media: PostMedia[];
    groupId: string | null;
    categoryId: string | null;
    likeCount: number;
    commentCount: number;
    createdAt: Timestamp;
    updatedAt: Timestamp | null;
}

/**
 * Post write type (to Firestore)
 */
export interface PostWrite {
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorPhoto: string | null;
    content: string;
    media: PostMedia[];
    groupId: string | null;
    categoryId: string | null;
    likeCount: number;
    commentCount: number;
    createdAt: FieldValue;
    updatedAt: FieldValue | null;
}

// ==================== Posts CRUD ====================

const postsCollection = collection(db, 'posts');

/**
 * Generate a new post ID BEFORE uploading media.
 * 
 * Flow:
 * 1. postId = getNewPostId()
 * 2. Upload media to posts/{userId}/{postId}/...
 * 3. createPost(postId, ...) with media URLs
 */
export function getNewPostId(): string {
    return doc(postsCollection).id;
}

/**
 * Create a new post with a pre-generated ID.
 * Author info is validated server-side against users_public/{uid}.
 */
export async function createPost(
    postId: string,
    authorId: string,
    authorName: string,
    authorUsername: string,
    authorPhoto: string | null,
    content: string,
    media: PostMedia[],
    groupId: string | null = null,
    categoryId: string | null = null
): Promise<void> {
    const postData: PostWrite = {
        authorId,
        authorName,
        authorUsername,
        authorPhoto,
        content,
        media,
        groupId,
        categoryId,
        likeCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: null
    };

    await setDoc(doc(postsCollection, postId), postData);
}

/**
 * Get a single post by ID
 */
export async function getPost(postId: string): Promise<PostRead | null> {
    const docSnap = await getDoc(doc(postsCollection, postId));
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
        id: docSnap.id,
        authorId: data.authorId,
        authorName: data.authorName,
        authorUsername: data.authorUsername,
        authorPhoto: data.authorPhoto,
        content: data.content,
        media: data.media || [],
        groupId: data.groupId,
        categoryId: data.categoryId,
        likeCount: data.likeCount || 0,
        commentCount: data.commentCount || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

/**
 * Get posts by group (paginated)
 */
export async function getPostsByGroup(
    groupId: string,
    pageSize: number = DEFAULT_LIMIT,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<PostRead>> {
    let q = query(
        postsCollection,
        where('groupId', '==', groupId),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const items = docs.map(d => ({
        id: d.id,
        ...d.data()
    } as PostRead));

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

/**
 * Get posts by user (paginated)
 */
export async function getPostsByUser(
    userId: string,
    pageSize: number = DEFAULT_LIMIT,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<PostRead>> {
    let q = query(
        postsCollection,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const items = docs.map(d => ({
        id: d.id,
        ...d.data()
    } as PostRead));

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

/**
 * Get posts by category (paginated)
 */
export async function getPostsByCategory(
    categoryId: string,
    pageSize: number = DEFAULT_LIMIT,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<PostRead>> {
    let q = query(
        postsCollection,
        where('categoryId', '==', categoryId),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const items = docs.map(d => ({
        id: d.id,
        ...d.data()
    } as PostRead));

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

/**
 * Get global feed (paginated) - posts from all groups
 */
export async function getGlobalFeed(
    pageSize: number = DEFAULT_LIMIT,
    lastDoc?: DocumentSnapshot
): Promise<PaginatedResult<PostRead>> {
    let q = query(
        postsCollection,
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const items = docs.map(d => ({
        id: d.id,
        ...d.data()
    } as PostRead));

    return {
        items,
        lastDoc: docs[docs.length - 1] || null,
        hasMore
    };
}

/**
 * Update a post (only content and media can be edited)
 */
export async function updatePost(
    postId: string,
    content: string,
    media: PostMedia[]
): Promise<void> {
    await updateDoc(doc(postsCollection, postId), {
        content,
        media,
        updatedAt: serverTimestamp()
    });
}

/**
 * Delete a post
 * Note: Cloud Function onPostDeleted handles cleanup of media + subcollections
 */
export async function deletePost(postId: string): Promise<void> {
    await deleteDoc(doc(postsCollection, postId));
}

// ==================== User Profile Functions ====================

/**
 * Get user profile by UID
 * Handles multiple scenarios:
 * - User exists in private 'users' collection
 * - User only exists in public 'users_public' collection
 * - Permission denied on 'users' collection (fallback to public)
 * - Missing fields in 'users' (complement with 'users_public')
 */
export async function getUserProfile(uid: string): Promise<UserProfileRead | null> {
    let privateData = null;
    let publicData = null;

    // 1. Try private collection (might fail with permission-denied)
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            privateData = userDoc.data();
        }
    } catch (error: any) {
        // Log permission-denied for debugging
        if (error?.code === 'permission-denied') {
            console.log('[getUserProfile] Permission denied for users/' + uid + ', falling back to public');
        }
    }

    // 2. Load public data (always, for fallback or complementing)
    try {
        const publicDoc = await getDoc(doc(db, 'users_public', uid));
        if (publicDoc.exists()) {
            publicData = publicDoc.data();
        }
    } catch (error) {
        console.error('[getUserProfile] Error loading public data:', error);
    }

    // 3. If neither exists, user not found
    if (!privateData && !publicData) {
        console.log('[getUserProfile] User not found in users or users_public: ' + uid);
        return null;
    }

    // 4. Merge data (private first, complement with public)
    return {
        uid: uid,
        displayName: privateData?.displayName ?? publicData?.displayName ?? null,
        displayNameLowercase: privateData?.displayNameLowercase ?? publicData?.displayNameLowercase ?? null,
        photoURL: privateData?.photoURL ?? publicData?.photoURL ?? null,
        email: privateData?.email ?? null,
        bio: privateData?.bio ?? null,
        role: privateData?.role ?? null,
        location: privateData?.location ?? null,
        username: privateData?.username ?? publicData?.username ?? null,
        reputation: privateData?.reputation ?? 0,
        createdAt: toDate(privateData?.createdAt ?? publicData?.createdAt) ?? new Date(),
        updatedAt: toDate(privateData?.updatedAt ?? publicData?.updatedAt) ?? new Date()
    };
}

/**
 * Update user profile
 * Updates both 'users' (private) and 'users_public' (public) collections
 */
export async function updateUserProfile(
    uid: string,
    updates: UserProfileUpdate
): Promise<void> {
    const batch = writeBatch(db);

    // Build updates object
    const userUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp()
    };
    const publicUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp()
    };

    if (updates.displayName !== undefined) {
        userUpdates.displayName = updates.displayName;
        userUpdates.displayNameLowercase = updates.displayName.toLowerCase();
        publicUpdates.displayName = updates.displayName;
        publicUpdates.displayNameLowercase = updates.displayName.toLowerCase();
    }

    if (updates.bio !== undefined) {
        userUpdates.bio = updates.bio;
    }

    if (updates.role !== undefined) {
        userUpdates.role = updates.role;
    }

    if (updates.location !== undefined) {
        userUpdates.location = updates.location;
    }

    if (updates.username !== undefined) {
        userUpdates.username = updates.username;
        publicUpdates.username = updates.username;
    }

    // Update private user doc
    batch.set(doc(db, 'users', uid), userUpdates, { merge: true });

    // Update public user doc (only public fields)
    batch.set(doc(db, 'users_public', uid), publicUpdates, { merge: true });

    await batch.commit();
}

/**
 * Subscribe to user profile changes
 */
export function subscribeToUserProfile(
    uid: string,
    onData: (profile: UserProfileRead | null) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    return onSnapshot(
        doc(db, 'users', uid),
        (snapshot) => {
            if (!snapshot.exists()) {
                onData(null);
                return;
            }
            const data = snapshot.data();
            onData({
                uid: data.uid || uid,
                displayName: data.displayName || null,
                displayNameLowercase: data.displayNameLowercase || null,
                photoURL: data.photoURL || null,
                email: data.email || null,
                bio: data.bio || null,
                role: data.role || null,
                location: data.location || null,
                username: data.username || null,
                reputation: data.reputation || 0,
                createdAt: toDate(data.createdAt) || new Date(),
                updatedAt: toDate(data.updatedAt) || new Date()
            });
        },
        onError
    );
}

// ==================== Friend Requests ====================

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequestRead {
    id: string;
    fromUid: string;
    toUid: string;
    status: FriendRequestStatus;
    fromUserName: string | null;
    fromUserPhoto: string | null;
    toUserName: string | null;
    toUserPhoto: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(
    fromUid: string,
    toUid: string,
    fromUserName: string | null,
    fromUserPhoto: string | null
): Promise<string> {
    // Check if request already exists
    const existingQuery = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', fromUid),
        where('toUid', '==', toUid)
    );
    const existing = await getDocs(existingQuery);

    if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const data = existingDoc.data();
        if (data.status === 'pending') {
            throw new Error('Ya enviaste una solicitud a este usuario');
        }
        if (data.status === 'accepted') {
            throw new Error('Ya son amigos');
        }
        // If rejected, allow re-sending
        await updateDoc(doc(db, 'friend_requests', existingDoc.id), {
            status: 'pending',
            updatedAt: serverTimestamp()
        });
        return existingDoc.id;
    }

    // Check if there's a reverse request (they sent one to us)
    const reverseQuery = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', toUid),
        where('toUid', '==', fromUid)
    );
    const reverse = await getDocs(reverseQuery);

    if (!reverse.empty) {
        const reverseDoc = reverse.docs[0];
        const data = reverseDoc.data();
        if (data.status === 'pending') {
            // Auto-accept: they already sent us a request
            await updateDoc(doc(db, 'friend_requests', reverseDoc.id), {
                status: 'accepted',
                updatedAt: serverTimestamp()
            });
            return reverseDoc.id;
        }
        if (data.status === 'accepted') {
            throw new Error('Ya son amigos');
        }
    }

    // Get target user info
    const toUserDoc = await getDoc(doc(db, 'users_public', toUid));
    const toUserData = toUserDoc.exists() ? toUserDoc.data() : {};

    // Create new request
    const requestRef = doc(collection(db, 'friend_requests'));
    await setDoc(requestRef, {
        fromUid,
        toUid,
        status: 'pending',
        fromUserName,
        fromUserPhoto,
        toUserName: toUserData.displayName || null,
        toUserPhoto: toUserData.photoURL || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return requestRef.id;
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'friend_requests', requestId), {
        status: 'accepted',
        updatedAt: serverTimestamp()
    });
}

/**
 * Reject a friend request
 */
export async function rejectFriendRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'friend_requests', requestId), {
        status: 'rejected',
        updatedAt: serverTimestamp()
    });
}

/**
 * Cancel a sent friend request
 */
export async function cancelFriendRequest(requestId: string): Promise<void> {
    await deleteDoc(doc(db, 'friend_requests', requestId));
}

/**
 * Get pending friend requests received by a user
 */
export async function getPendingFriendRequests(uid: string): Promise<FriendRequestRead[]> {
    const q = query(
        collection(db, 'friend_requests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            fromUid: data.fromUid,
            toUid: data.toUid,
            status: data.status,
            fromUserName: data.fromUserName || null,
            fromUserPhoto: data.fromUserPhoto || null,
            toUserName: data.toUserName || null,
            toUserPhoto: data.toUserPhoto || null,
            createdAt: toDate(data.createdAt) || new Date(),
            updatedAt: toDate(data.updatedAt) || new Date()
        };
    });
}

/**
 * Get sent friend requests by a user
 */
export async function getSentFriendRequests(uid: string): Promise<FriendRequestRead[]> {
    const q = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            fromUid: data.fromUid,
            toUid: data.toUid,
            status: data.status,
            fromUserName: data.fromUserName || null,
            fromUserPhoto: data.fromUserPhoto || null,
            toUserName: data.toUserName || null,
            toUserPhoto: data.toUserPhoto || null,
            createdAt: toDate(data.createdAt) || new Date(),
            updatedAt: toDate(data.updatedAt) || new Date()
        };
    });
}

/**
 * Get friends (accepted requests in both directions)
 */
export async function getFriends(uid: string): Promise<PublicUserRead[]> {
    // Get accepted requests where user is sender
    const sentQ = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', uid),
        where('status', '==', 'accepted')
    );

    // Get accepted requests where user is receiver
    const receivedQ = query(
        collection(db, 'friend_requests'),
        where('toUid', '==', uid),
        where('status', '==', 'accepted')
    );

    const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(sentQ),
        getDocs(receivedQ)
    ]);

    const friendUids = new Set<string>();

    sentSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        friendUids.add(data.toUid);
    });

    receivedSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        friendUids.add(data.fromUid);
    });

    // Fetch friend profiles
    const friends: PublicUserRead[] = [];
    for (const friendUid of friendUids) {
        const userDoc = await getDoc(doc(db, 'users_public', friendUid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            friends.push({
                uid: friendUid,
                displayName: data.displayName || null,
                photoURL: data.photoURL || null
            });
        }
    }

    return friends;
}

/**
 * Get friendship status between two users
 */
export async function getFriendshipStatus(
    currentUid: string,
    targetUid: string
): Promise<{ status: 'none' | 'friends' | 'pending_sent' | 'pending_received'; requestId?: string }> {
    // Check if we sent a request
    const sentQ = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', currentUid),
        where('toUid', '==', targetUid)
    );
    const sentSnap = await getDocs(sentQ);

    if (!sentSnap.empty) {
        const data = sentSnap.docs[0].data();
        if (data.status === 'accepted') {
            return { status: 'friends', requestId: sentSnap.docs[0].id };
        }
        if (data.status === 'pending') {
            return { status: 'pending_sent', requestId: sentSnap.docs[0].id };
        }
    }

    // Check if they sent us a request
    const receivedQ = query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', targetUid),
        where('toUid', '==', currentUid)
    );
    const receivedSnap = await getDocs(receivedQ);

    if (!receivedSnap.empty) {
        const data = receivedSnap.docs[0].data();
        if (data.status === 'accepted') {
            return { status: 'friends', requestId: receivedSnap.docs[0].id };
        }
        if (data.status === 'pending') {
            return { status: 'pending_received', requestId: receivedSnap.docs[0].id };
        }
    }

    return { status: 'none' };
}

// ==================== Collaborations ====================

export type CollaborationStatus = 'open' | 'closed';
export type CollaborationMode = 'virtual' | 'presencial';
export type CollaborationLevel = 'principiante' | 'intermedio' | 'experto';

export type CollaborationAuthorSnapshot = {
    displayName: string;
    photoURL: string | null;
};

export interface CollaborationRead {
    id: string;
    title: string;
    context: string;
    seekingRole: string;
    mode: CollaborationMode;
    location: string | null;
    level: CollaborationLevel;
    topic: string | null;
    tags: string[];
    authorId: string;
    authorSnapshot: CollaborationAuthorSnapshot;
    status: CollaborationStatus;
    createdAt: Date;
    updatedAt: Date;
}

const mapCollaborationDoc = (docSnap: DocumentSnapshot): CollaborationRead => {
    const data = docSnap.data() as Record<string, unknown> | undefined;
    const authorSnapshotData = (data?.authorSnapshot ?? {}) as Record<string, unknown>;
    const createdAt = toDate(data?.createdAt) || new Date();
    const updatedAt = toDate(data?.updatedAt) || createdAt;
    const tags = Array.isArray(data?.tags) ? data?.tags.filter((tag) => typeof tag === 'string') : [];
    const status = data?.status === 'closed' ? 'closed' : 'open';
    const mode = data?.mode === 'presencial' ? 'presencial' : 'virtual';
    const level = data?.level === 'experto' ? 'experto' : data?.level === 'intermedio' ? 'intermedio' : 'principiante';

    return {
        id: docSnap.id,
        title: typeof data?.title === 'string' ? data.title : '',
        context: typeof data?.context === 'string' ? data.context : '',
        seekingRole: typeof data?.seekingRole === 'string' ? data.seekingRole : '',
        mode,
        location: typeof data?.location === 'string' ? data.location : null,
        level,
        topic: typeof data?.topic === 'string' ? data.topic : null,
        tags: tags as string[],
        authorId: typeof data?.authorId === 'string' ? data.authorId : '',
        authorSnapshot: {
            displayName: typeof authorSnapshotData.displayName === 'string' ? authorSnapshotData.displayName : 'Usuario',
            photoURL: typeof authorSnapshotData.photoURL === 'string' ? authorSnapshotData.photoURL : null
        },
        status,
        createdAt,
        updatedAt
    };
};

export async function getCollaborations(limitCount = 20): Promise<CollaborationRead[]> {
    const q = query(collection(db, 'collaborations'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapCollaborationDoc).filter((item) => item.status === 'open');
}

export interface CreateCollaborationInput {
    title: string;
    context: string;
    seekingRole: string;
    mode: CollaborationMode;
    location: string | null;
    level: CollaborationLevel;
    topic: string | null;
    tags: string[];
}

export async function createCollaboration(
    authorId: string,
    authorSnapshot: CollaborationAuthorSnapshot,
    input: CreateCollaborationInput
): Promise<string> {
    const collaborationRef = doc(collection(db, 'collaborations'));
    await setDoc(collaborationRef, {
        title: input.title,
        context: input.context,
        seekingRole: input.seekingRole,
        mode: input.mode,
        location: input.location,
        level: input.level,
        topic: input.topic,
        tags: input.tags,
        authorId,
        authorSnapshot,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return collaborationRef.id;
}

export async function updateCollaboration(
    collaborationId: string,
    input: CreateCollaborationInput
): Promise<void> {
    await updateDoc(doc(db, 'collaborations', collaborationId), {
        title: input.title,
        context: input.context,
        seekingRole: input.seekingRole,
        mode: input.mode,
        location: input.location,
        level: input.level,
        topic: input.topic,
        tags: input.tags,
        updatedAt: serverTimestamp()
    });
}

export type CollaborationRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface CollaborationRequestRead {
    id: string;
    collaborationId: string;
    collaborationTitle: string;
    fromUid: string;
    toUid: string;
    status: CollaborationRequestStatus;
    message: string | null;
    fromUserName: string | null;
    fromUserPhoto: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function sendCollaborationRequest(input: {
    collaborationId: string;
    collaborationTitle: string;
    fromUid: string;
    toUid: string;
    message: string | null;
    fromUserName: string | null;
    fromUserPhoto: string | null;
}): Promise<string> {
    const existingQuery = query(
        collection(db, 'collaboration_requests'),
        where('fromUid', '==', input.fromUid),
        where('collaborationId', '==', input.collaborationId)
    );
    const existing = await getDocs(existingQuery);

    if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const data = existingDoc.data();
        if (data.status === 'pending') {
            throw new Error('Ya enviaste una solicitud para este proyecto.');
        }
        if (data.status === 'accepted') {
            throw new Error('Esta solicitud ya fue aceptada.');
        }
    }

    const requestRef = doc(collection(db, 'collaboration_requests'));
    await setDoc(requestRef, {
        collaborationId: input.collaborationId,
        collaborationTitle: input.collaborationTitle,
        fromUid: input.fromUid,
        toUid: input.toUid,
        status: 'pending',
        message: input.message,
        fromUserName: input.fromUserName,
        fromUserPhoto: input.fromUserPhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return requestRef.id;
}

export async function deleteCollaboration(authorId: string, collaborationId: string): Promise<void> {
    const pendingQuery = query(
        collection(db, 'collaboration_requests'),
        where('collaborationId', '==', collaborationId),
        where('toUid', '==', authorId),
        where('status', '==', 'pending')
    );
    const pendingSnapshot = await getDocs(pendingQuery);

    const batch = writeBatch(db);
    pendingSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
            status: 'rejected',
            updatedAt: serverTimestamp()
        });
    });

    batch.delete(doc(db, 'collaborations', collaborationId));
    await batch.commit();
}

export async function getPendingCollaborationRequests(uid: string): Promise<CollaborationRequestRead[]> {
    const q = query(
        collection(db, 'collaboration_requests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const createdAt = toDate(data.createdAt) || new Date();
        const updatedAt = toDate(data.updatedAt) || createdAt;

        return {
            id: docSnap.id,
            collaborationId: data.collaborationId || '',
            collaborationTitle: data.collaborationTitle || '',
            fromUid: data.fromUid || '',
            toUid: data.toUid || '',
            status: (data.status as CollaborationRequestStatus) || 'pending',
            message: data.message || null,
            fromUserName: data.fromUserName || null,
            fromUserPhoto: data.fromUserPhoto || null,
            createdAt,
            updatedAt
        } as CollaborationRequestRead;
    });

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function acceptCollaborationRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'collaboration_requests', requestId), {
        status: 'accepted',
        updatedAt: serverTimestamp()
    });
}

export async function rejectCollaborationRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'collaboration_requests', requestId), {
        status: 'rejected',
        updatedAt: serverTimestamp()
    });
}

