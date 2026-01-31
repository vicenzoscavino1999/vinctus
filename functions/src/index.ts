/**
 * Vinctus Cloud Functions
 * Production-ready atomic counters and triggers with deduplication
 * 
 * Features:
 * - Atomic memberCount for groups
 * - Atomic likesCount for posts
 * - Cascade cleanup on delete
 * - Event deduplication (at-least-once safety)
 * - Atomic decrement with negative prevention
 * - Parent existence checks
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ==========================================================
// EVENT ATTENDEE COUNTERS (With Deduplication)
// ==========================================================

/**
 * Increment attendeesCount when a user joins an event
 * Trigger: onCreate events/{eventId}/attendees/{userId}
 */
export const onEventAttendeeCreated = functions.firestore
    .document("events/{eventId}/attendees/{userId}")
    .onCreate(async (snap, context) => {
        const { eventId, userId } = context.params;
        const dedupEventId = context.eventId;

        try {
            functions.logger.info("Event attendee joined", { eventId, userId, dedupEventId });

            const eventRef = db.doc(`events/${eventId}`);
            await deduplicatedIncrement(dedupEventId, eventRef, "attendeesCount", 1);

            functions.logger.info("Event attendeesCount incremented", { eventId, dedupEventId });
        } catch (error) {
            functions.logger.error("Failed to increment event attendeesCount", {
                eventId,
                userId,
                dedupEventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Decrement attendeesCount when a user leaves an event
 * Trigger: onDelete events/{eventId}/attendees/{userId}
 */
export const onEventAttendeeDeleted = functions.firestore
    .document("events/{eventId}/attendees/{userId}")
    .onDelete(async (snap, context) => {
        const { eventId, userId } = context.params;
        const dedupEventId = context.eventId;

        try {
            functions.logger.info("Event attendee left", { eventId, userId, dedupEventId });

            const eventRef = db.doc(`events/${eventId}`);
            await deduplicatedDecrement(dedupEventId, eventRef, "attendeesCount");

            functions.logger.info("Event attendeesCount decremented", { eventId, dedupEventId });
        } catch (error) {
            functions.logger.error("Failed to decrement event attendeesCount", {
                eventId,
                userId,
                dedupEventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });


// ==========================================================
// 🛡️ DEDUPLICATION HELPER
// ==========================================================

/**
 * Execute increment with event deduplication
 * Prevents double-counting on retry
 */
async function deduplicatedIncrement(
    eventId: string,
    docRef: admin.firestore.DocumentReference,
    field: string,
    delta: number
): Promise<void> {
    const dedupRef = db.collection("_dedup_events").doc(eventId);

    await db.runTransaction(async (tx) => {
        const dedupDoc = await tx.get(dedupRef);

        // If already processed, skip
        if (dedupDoc.exists) {
            functions.logger.info("Event already processed, skipping", { eventId });
            return;
        }

        // Mark as processed and increment
        tx.create(dedupRef, {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            processedAt: new Date().toISOString()
        });
        tx.update(docRef, {
            [field]: admin.firestore.FieldValue.increment(delta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
}

/**
 * Execute decrement with deduplication and negative prevention
 * Prevents double-counting and going below zero
 */
async function deduplicatedDecrement(
    eventId: string,
    docRef: admin.firestore.DocumentReference,
    field: string
): Promise<void> {
    const dedupRef = db.collection("_dedup_events").doc(eventId);

    await db.runTransaction(async (tx) => {
        const dedupDoc = await tx.get(dedupRef);

        // If already processed, skip
        if (dedupDoc.exists) {
            functions.logger.info("Event already processed, skipping", { eventId });
            return;
        }

        // Check current value atomically
        const parentDoc = await tx.get(docRef);

        // If parent doesn't exist, skip (already deleted)
        if (!parentDoc.exists) {
            functions.logger.warn("Parent document doesn't exist, skipping decrement", {
                path: docRef.path
            });
            return;
        }

        const currentValue = (parentDoc.data()?.[field] ?? 0) as number;

        // Only decrement if > 0
        if (currentValue <= 0) {
            functions.logger.warn("Counter already at 0, skipping decrement", {
                path: docRef.path,
                field,
                currentValue
            });
            return;
        }

        // Mark as processed and decrement
        tx.create(dedupRef, {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            processedAt: new Date().toISOString()
        });
        tx.update(docRef, {
            [field]: currentValue - 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
}


// ==========================================================
// FOLLOW COUNTERS (With Deduplication)
// ==========================================================

async function deduplicatedUserCounterUpdate(
    eventId: string,
    userId: string,
    field: string,
    delta: number
): Promise<void> {
    const dedupRef = db.collection("_dedup_events").doc(eventId);
    const userRef = db.doc(`users/${userId}`);
    const publicRef = db.doc(`users_public/${userId}`);

    await db.runTransaction(async (tx) => {
        const dedupDoc = await tx.get(dedupRef);

        if (dedupDoc.exists) {
            functions.logger.info("Event already processed, skipping", { eventId });
            return;
        }

        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            tx.create(dedupRef, {
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                processedAt: new Date().toISOString()
            });
            functions.logger.warn("User document missing for counter update", { userId, field });
            return;
        }

        const currentValue = (userSnap.data()?.[field] ?? 0) as number;
        const nextValue = Math.max(0, currentValue + delta);

        tx.create(dedupRef, {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            processedAt: new Date().toISOString()
        });
        tx.set(userRef, { [field]: nextValue }, { merge: true });
        tx.set(publicRef, { [field]: nextValue }, { merge: true });
    });
}

export const onUserFollowerCreated = functions.firestore
    .document("users/{uid}/followers/{followerUid}")
    .onCreate(async (_snap, context) => {
        const { uid, followerUid } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Follower added", { uid, followerUid, eventId });
            await deduplicatedUserCounterUpdate(eventId, uid, "followersCount", 1);
        } catch (error) {
            functions.logger.error("Failed to increment followersCount", {
                uid,
                followerUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        if (uid === followerUid) {
            return;
        }

        try {
            const [blockedByTarget, blockedByFollower] = await Promise.all([
                db.doc(`users/${uid}/blockedUsers/${followerUid}`).get(),
                db.doc(`users/${followerUid}/blockedUsers/${uid}`).get()
            ]);
            if (blockedByTarget.exists || blockedByFollower.exists) {
                functions.logger.info("Skipping follow notification due to block", {
                    uid,
                    followerUid,
                    blockedByTarget: blockedByTarget.exists,
                    blockedByFollower: blockedByFollower.exists
                });
                return;
            }

            const followerSnap = await db.doc(`users_public/${followerUid}`).get();
            const followerData = followerSnap.exists ? followerSnap.data() : null;
            const fromUserName = typeof followerData?.displayName === "string" ? followerData.displayName : null;
            const fromUserPhoto = typeof followerData?.photoURL === "string" ? followerData.photoURL : null;

            const notificationRef = db.doc(`notifications/follow_${eventId}`);
            await notificationRef.set({
                type: "follow",
                toUid: uid,
                fromUid: followerUid,
                fromUserName,
                fromUserPhoto,
                postId: null,
                postSnippet: null,
                commentText: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
            }, { merge: true });
        } catch (error) {
            functions.logger.error("Failed to create follow notification", {
                uid,
                followerUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

export const onUserFollowerDeleted = functions.firestore
    .document("users/{uid}/followers/{followerUid}")
    .onDelete(async (_snap, context) => {
        const { uid, followerUid } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Follower removed", { uid, followerUid, eventId });
            await deduplicatedUserCounterUpdate(eventId, uid, "followersCount", -1);
        } catch (error) {
            functions.logger.error("Failed to decrement followersCount", {
                uid,
                followerUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

export const onUserFollowingCreated = functions.firestore
    .document("users/{uid}/following/{targetUid}")
    .onCreate(async (_snap, context) => {
        const { uid, targetUid } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Following added", { uid, targetUid, eventId });
            await deduplicatedUserCounterUpdate(eventId, uid, "followingCount", 1);
        } catch (error) {
            functions.logger.error("Failed to increment followingCount", {
                uid,
                targetUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

export const onUserFollowingDeleted = functions.firestore
    .document("users/{uid}/following/{targetUid}")
    .onDelete(async (_snap, context) => {
        const { uid, targetUid } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Following removed", { uid, targetUid, eventId });
            await deduplicatedUserCounterUpdate(eventId, uid, "followingCount", -1);
        } catch (error) {
            functions.logger.error("Failed to decrement followingCount", {
                uid,
                targetUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

export const onFollowRequestUpdated = functions.firestore
    .document("follow_requests/{requestId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data() || {};
        const after = change.after.data() || {};
        const eventId = context.eventId;

        if (before.status === after.status || after.status !== "accepted") {
            return;
        }

        const fromUid = after.fromUid as string | undefined;
        const toUid = after.toUid as string | undefined;
        if (!fromUid || !toUid) {
            functions.logger.warn("Follow request missing UIDs", { requestId: context.params.requestId });
            return;
        }

        try {
            const dedupRef = db.collection("_dedup_events").doc(eventId);
            const followerRef = db.doc(`users/${toUid}/followers/${fromUid}`);
            const followingRef = db.doc(`users/${fromUid}/following/${toUid}`);

            await db.runTransaction(async (tx) => {
                const dedupDoc = await tx.get(dedupRef);
                if (dedupDoc.exists) {
                    functions.logger.info("Event already processed, skipping", { eventId });
                    return;
                }

                tx.create(dedupRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    processedAt: new Date().toISOString()
                });
                tx.set(followerRef, {
                    uid: fromUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                tx.set(followingRef, {
                    uid: toUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        } catch (error) {
            functions.logger.error("Failed to accept follow request", {
                fromUid,
                toUid,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// 📈 GROUP MEMBER COUNTERS (With Deduplication)
// ==========================================================

/**
 * Increment memberCount when a user joins a group
 * Trigger: onCreate groups/{groupId}/members/{userId}
 */
export const onGroupMemberCreated = functions.firestore
    .document("groups/{groupId}/members/{userId}")
    .onCreate(async (snap, context) => {
        const { groupId, userId } = context.params;
        const eventId = context.eventId;

        functions.logger.info("Member joined group", {
            groupId,
            userId,
            eventId
        });

        try {
            const groupRef = db.doc(`groups/${groupId}`);
            await deduplicatedIncrement(eventId, groupRef, "memberCount", 1);
            functions.logger.info("Member count incremented", { groupId, eventId });
        } catch (error) {
            functions.logger.error("Failed to increment member count", {
                groupId,
                userId,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        try {
            await ensureGroupConversationForMember(groupId, userId);
        } catch (error) {
            functions.logger.error("Failed to ensure group conversation member", {
                groupId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Decrement memberCount when a user leaves a group
 * Trigger: onDelete groups/{groupId}/members/{userId}
 */
export const onGroupMemberDeleted = functions.firestore
    .document("groups/{groupId}/members/{userId}")
    .onDelete(async (snap, context) => {
        const { groupId, userId } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Member left group", { groupId, userId, eventId });

            const groupRef = db.doc(`groups/${groupId}`);
            await deduplicatedDecrement(eventId, groupRef, "memberCount");

            functions.logger.info("Member count decremented", { groupId, eventId });
        } catch (error) {
            functions.logger.error("Failed to decrement member count", {
                groupId,
                userId,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        try {
            const conversationId = `grp_${groupId}`;
            await db.doc(`conversations/${conversationId}/members/${userId}`).delete();
        } catch (error) {
            functions.logger.error("Failed to remove group conversation member", {
                groupId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

async function ensureGroupConversationForMember(groupId: string, uid: string): Promise<void> {
    const conversationId = `grp_${groupId}`;
    const convRef = db.doc(`conversations/${conversationId}`);
    const memberRef = db.doc(`conversations/${conversationId}/members/${uid}`);

    await db.runTransaction(async (tx) => {
        const convSnap = await tx.get(convRef);
        if (!convSnap.exists) {
            tx.create(convRef, {
                type: "group",
                groupId,
                lastMessage: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const data = convSnap.data() || {};
            const updates: Record<string, unknown> = {};
            if (data.type !== "group") {
                updates.type = "group";
            }
            if (data.groupId !== groupId) {
                updates.groupId = groupId;
            }
            if (Object.keys(updates).length > 0) {
                updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
                tx.set(convRef, updates, { merge: true });
            }
        }

        const memberSnap = await tx.get(memberRef);
        if (!memberSnap.exists) {
            tx.create(memberRef, {
                uid,
                role: "member",
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastReadClientAt: Date.now(),
                lastReadAt: admin.firestore.FieldValue.serverTimestamp(),
                muted: false
            });
        }
    });
}

// ==========================================================
// ❤️ POST LIKE COUNTERS (With Deduplication)
// ==========================================================

/**
 * Increment likesCount when a user likes a post
 * Trigger: onCreate posts/{postId}/likes/{userId}
 */
export const onPostLikeCreated = functions.firestore
    .document("posts/{postId}/likes/{userId}")
    .onCreate(async (snap, context) => {
        const { postId, userId } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Post liked", { postId, userId, eventId });

            const postRef = db.doc(`posts/${postId}`);
            await deduplicatedIncrement(eventId, postRef, "likesCount", 1);

            functions.logger.info("Likes count incremented", { postId, eventId });
        } catch (error) {
            functions.logger.error("Failed to increment likes count", {
                postId,
                userId,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Decrement likesCount when a user unlikes a post
 * Trigger: onDelete posts/{postId}/likes/{userId}
 */
export const onPostLikeDeleted = functions.firestore
    .document("posts/{postId}/likes/{userId}")
    .onDelete(async (snap, context) => {
        const { postId, userId } = context.params;
        const eventId = context.eventId;

        try {
            functions.logger.info("Post unliked", { postId, userId, eventId });

            const postRef = db.doc(`posts/${postId}`);
            await deduplicatedDecrement(eventId, postRef, "likesCount");

            functions.logger.info("Likes count decremented", { postId, eventId });
        } catch (error) {
            functions.logger.error("Failed to decrement likes count", {
                postId,
                userId,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// 🧹 CASCADE CLEANUP (Safe - Won't Trigger Decrements)
// ==========================================================

/**
 * Clean up subcollections when a group is deleted
 * Prevents orphaned data
 * Trigger: onDelete groups/{groupId}
 */
export const onGroupDeleted = functions.firestore
    .document("groups/{groupId}")
    .onDelete(async (snap, context) => {
        const { groupId } = context.params;

        try {
            functions.logger.info("Group deleted, cleaning up subcollections", { groupId });

            // Delete all members in batches (max 500 per batch)
            const membersRef = db.collection(`groups/${groupId}/members`);
            const membersSnapshot = await membersRef.get();

            if (membersSnapshot.empty) {
                functions.logger.info("No members to clean up", { groupId });
                return;
            }

            // Firestore batch has limit of 500 operations
            const batchSize = 450; // Use 450 for safety margin
            const batches: admin.firestore.WriteBatch[] = [];
            let currentBatch = db.batch();
            let operationCount = 0;

            membersSnapshot.docs.forEach((doc) => {
                currentBatch.delete(doc.ref);
                operationCount++;

                if (operationCount === batchSize) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationCount = 0;
                }
            });

            // Add the last batch if it has operations
            if (operationCount > 0) {
                batches.push(currentBatch);
            }

            // Commit all batches
            await Promise.all(batches.map(batch => batch.commit()));

            functions.logger.info("Members cleaned up", {
                groupId,
                totalDeleted: membersSnapshot.size,
                batchCount: batches.length
            });
        } catch (error) {
            functions.logger.error("Failed to clean up group members", {
                groupId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Clean up subcollections when an event is deleted
 * Trigger: onDelete events/{eventId}
 */
export const onEventDeleted = functions.firestore
    .document("events/{eventId}")
    .onDelete(async (snap, context) => {
        const { eventId } = context.params;

        try {
            functions.logger.info("Event deleted, cleaning up attendees", { eventId });

            const attendeesRef = db.collection(`events/${eventId}/attendees`);
            try {
                await db.recursiveDelete(attendeesRef);
                functions.logger.info("Deleted event attendees subcollection", { eventId });
            } catch (error) {
                functions.logger.error("Failed to delete event attendees subcollection", {
                    eventId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        } catch (error) {
            functions.logger.error("Failed to clean up event attendees", {
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Increment postsCount when a post is created
 * Trigger: onCreate posts/{postId}
 */
export const onPostCreated = functions.firestore
    .document("posts/{postId}")
    .onCreate(async (snap, context) => {
        const { postId } = context.params;
        const eventId = context.eventId;
        const data = snap.data();
        const authorId = data?.authorId as string | undefined;

        if (!authorId) {
            functions.logger.warn("Post created without authorId", { postId });
            return;
        }

        try {
            functions.logger.info("Post created", { postId, authorId, eventId });
            await deduplicatedUserCounterUpdate(eventId, authorId, "postsCount", 1);
        } catch (error) {
            functions.logger.error("Failed to increment postsCount", {
                postId,
                authorId,
                eventId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Clean up subcollections and media when a post is deleted
 * - Deletes all media files from Storage
 * - Deletes likes subcollection (using recursiveDelete for >500 docs)
 * - Deletes comments subcollection (future-proofing)
 * Trigger: onDelete posts/{postId}
 */
export const onPostDeleted = functions.firestore
    .document("posts/{postId}")
    .onDelete(async (snap, context) => {
        const { postId } = context.params;
        const eventId = context.eventId;
        const data = snap.data();
        const authorId = data?.authorId as string | undefined;

        if (authorId) {
            try {
                await deduplicatedUserCounterUpdate(eventId, authorId, "postsCount", -1);
            } catch (error) {
                functions.logger.error("Failed to decrement postsCount", {
                    postId,
                    authorId,
                    eventId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        try {
            functions.logger.info("Post deleted, cleaning up", { postId });

            // 1. Delete media files from Storage
            const media = (data?.media || []) as Array<{ path: string }>;
            if (media.length > 0) {
                const bucket = admin.storage().bucket();
                const deletePromises = media.map(async (item) => {
                    try {
                        await bucket.file(item.path).delete();
                        functions.logger.info("Deleted media file", { path: item.path });
                    } catch (error) {
                        functions.logger.warn("Failed to delete media file (may not exist)", {
                            path: item.path,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                });
                await Promise.all(deletePromises);
            }

            // 2. Delete likes subcollection (handles >500 docs with recursiveDelete)
            const likesRef = db.collection(`posts/${postId}/likes`);
            try {
                await db.recursiveDelete(likesRef);
                functions.logger.info("Deleted likes subcollection", { postId });
            } catch (error) {
                functions.logger.error("Failed to delete likes subcollection", {
                    postId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }

            // 3. Delete comments subcollection (future-proofing)
            const commentsRef = db.collection(`posts/${postId}/comments`);
            try {
                await db.recursiveDelete(commentsRef);
                functions.logger.info("Deleted comments subcollection", { postId });
            } catch (error) {
                functions.logger.error("Failed to delete comments subcollection", {
                    postId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }

            functions.logger.info("Post cleanup complete", {
                postId,
                mediaCount: media.length
            });
        } catch (error) {
            functions.logger.error("Failed to clean up post", {
                postId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });


/**
 * Delete collection files when a collection item is deleted
 * Trigger: onDelete users/{uid}/collections/{collectionId}/items/{itemId}
 */
export const onCollectionItemDeleted = functions.firestore
    .document("users/{uid}/collections/{collectionId}/items/{itemId}")
    .onDelete(async (snap, context) => {
        const { uid, collectionId, itemId } = context.params;
        const data = snap.data();
        const storagePath = data?.storagePath as string | undefined;

        if (!storagePath) {
            return;
        }

        try {
            const bucket = admin.storage().bucket();
            await bucket.file(storagePath).delete();
            functions.logger.info("Deleted collection file", {
                uid,
                collectionId,
                itemId,
                storagePath
            });
        } catch (error) {
            functions.logger.warn("Failed to delete collection file (may not exist)", {
                uid,
                collectionId,
                itemId,
                storagePath,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

/**
 * Clean up collection items when a collection is deleted
 * Trigger: onDelete users/{uid}/collections/{collectionId}
 */
export const onCollectionDeleted = functions.firestore
    .document("users/{uid}/collections/{collectionId}")
    .onDelete(async (snap, context) => {
        const { uid, collectionId } = context.params;

        try {
            const itemsRef = db.collection(`users/${uid}/collections/${collectionId}/items`);
            await db.recursiveDelete(itemsRef);
            functions.logger.info("Deleted collection items", { uid, collectionId });
        } catch (error) {
            functions.logger.error("Failed to delete collection items", {
                uid,
                collectionId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// MESSAGE SENDER METADATA SYNC
// ==========================================================

/**
 * Update recent messages when a user changes their public profile
 * Trigger: onUpdate users_public/{uid}
 */
export const onUserPublicProfileUpdated = functions.firestore
    .document("users_public/{uid}")
    .onUpdate(async (change, context) => {
        const { uid } = context.params;
        const before = change.before.data() || {};
        const after = change.after.data() || {};

        const nameChanged = before.displayName !== after.displayName;
        const photoChanged = before.photoURL !== after.photoURL;
        if (!nameChanged && !photoChanged) {
            return;
        }

        const senderName = typeof after.displayName === "string" ? after.displayName : null;
        const senderPhotoURL = typeof after.photoURL === "string" ? after.photoURL : null;

        try {
            const messagesQuery = db
                .collectionGroup("messages")
                .where("senderId", "==", uid)
                .orderBy("createdAt", "desc")
                .limit(500);

            const snapshot = await messagesQuery.get();
            if (snapshot.empty) {
                functions.logger.info("No messages to update for profile change", { uid });
                return;
            }

            const batchSize = 400;
            let batch = db.batch();
            let opCount = 0;
            const commits: Array<Promise<unknown>> = [];

            snapshot.docs.forEach((doc) => {
                batch.update(doc.ref, {
                    senderName,
                    senderPhotoURL,
                    senderUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                opCount += 1;

                if (opCount === batchSize) {
                    commits.push(batch.commit());
                    batch = db.batch();
                    opCount = 0;
                }
            });

            if (opCount > 0) {
                commits.push(batch.commit());
            }

            await Promise.all(commits);

            functions.logger.info("Updated message sender metadata", {
                uid,
                updatedCount: snapshot.size
            });
        } catch (error) {
            functions.logger.error("Failed to update message sender metadata", {
                uid,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// FRIEND INDEX (Stories visibility)
// ==========================================================

export const onFriendRequestWrite = functions.firestore
    .document("friend_requests/{requestId}")
    .onWrite(async (change) => {
        const after = change.after.exists ? change.after.data() : null;
        const before = change.before.exists ? change.before.data() : null;

        const fromUid = (after?.fromUid ?? before?.fromUid) as string | undefined;
        const toUid = (after?.toUid ?? before?.toUid) as string | undefined;
        if (!fromUid || !toUid) {
            return;
        }

        const wasAccepted = before?.status === "accepted";
        const isAccepted = after?.status === "accepted";

        const fromRef = db.doc(`users/${fromUid}/friends/${toUid}`);
        const toRef = db.doc(`users/${toUid}/friends/${fromUid}`);

        try {
            if (isAccepted) {
                const payload = {
                    uid: toUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                const reversePayload = {
                    uid: fromUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                await Promise.all([
                    fromRef.set(payload, { merge: true }),
                    toRef.set(reversePayload, { merge: true })
                ]);
            } else if (wasAccepted && !isAccepted) {
                await Promise.all([
                    fromRef.delete(),
                    toRef.delete()
                ]);
            }
        } catch (error) {
            functions.logger.error("Failed to sync friend index", {
                fromUid,
                toUid,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

const DIRECT_CONVERSATION_PREFIX = "dm_";

function parseDirectConversationMembers(
    conversationId: string,
    data: Record<string, unknown> | undefined | null
): string[] {
    const memberIds = Array.isArray(data?.memberIds)
        ? data.memberIds.filter((id: unknown) => typeof id === "string")
        : [];
    if (memberIds.length === 2) {
        return memberIds;
    }

    if (!conversationId.startsWith(DIRECT_CONVERSATION_PREFIX)) {
        return [];
    }

    const parts = conversationId
        .slice(DIRECT_CONVERSATION_PREFIX.length)
        .split("_")
        .filter(Boolean);
    return parts.length === 2 ? parts : [];
}

/**
 * Keep per-user direct conversation index in sync
 * Trigger: onWrite conversations/{conversationId}
 */
export const onDirectConversationWrite = functions.firestore
    .document("conversations/{conversationId}")
    .onWrite(async (change, context) => {
        const { conversationId } = context.params;
        const after = change.after.exists ? change.after.data() : null;
        const before = change.before.exists ? change.before.data() : null;

        if (!after) {
            const memberIds = parseDirectConversationMembers(conversationId, before);
            if (memberIds.length !== 2) {
                return;
            }

            await Promise.all(
                memberIds.map((uid) =>
                    db.doc(`users/${uid}/directConversations/${conversationId}`)
                        .delete()
                        .catch((error) => {
                            functions.logger.warn("Failed to delete direct conversation index", {
                                conversationId,
                                uid,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        })
                )
            );
            return;
        }

        const isDirect = after.type === "direct" || conversationId.startsWith(DIRECT_CONVERSATION_PREFIX);
        if (!isDirect) {
            return;
        }

        const memberIds = parseDirectConversationMembers(conversationId, after);
        if (memberIds.length !== 2) {
            functions.logger.warn("Direct conversation missing memberIds", { conversationId });
            return;
        }

        const updatedAt = after.updatedAt ?? admin.firestore.FieldValue.serverTimestamp();
        const [firstUid, secondUid] = memberIds;

        const [firstBlockedSnap, secondBlockedSnap] = await Promise.all([
            db.doc(`users/${firstUid}/blockedUsers/${secondUid}`).get(),
            db.doc(`users/${secondUid}/blockedUsers/${firstUid}`).get()
        ]);

        const writes: Promise<unknown>[] = [];
        if (!firstBlockedSnap.exists) {
            writes.push(
                db.doc(`users/${firstUid}/directConversations/${conversationId}`).set({
                    conversationId,
                    otherUid: secondUid,
                    type: "direct",
                    updatedAt
                }, { merge: true })
            );
        } else {
            functions.logger.info("Skipping direct conversation index for blocked user", {
                conversationId,
                uid: firstUid,
                blockedUid: secondUid
            });
        }

        if (!secondBlockedSnap.exists) {
            writes.push(
                db.doc(`users/${secondUid}/directConversations/${conversationId}`).set({
                    conversationId,
                    otherUid: firstUid,
                    type: "direct",
                    updatedAt
                }, { merge: true })
            );
        } else {
            functions.logger.info("Skipping direct conversation index for blocked user", {
                conversationId,
                uid: secondUid,
                blockedUid: firstUid
            });
        }

        if (writes.length > 0) {
            await Promise.all(writes);
        }
    });

// ==========================================================
// SESSION MANAGEMENT
// ==========================================================

export const revokeUserSessions = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesion.");
    }

    const uid = context.auth.uid;
    await admin.auth().revokeRefreshTokens(uid);
    return { ok: true };
});
