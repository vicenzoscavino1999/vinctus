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

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

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

        try {
            functions.logger.info("Member joined group", {
                groupId,
                userId,
                eventId
            });

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
            // Don't throw - we don't want to fail the user's join action
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
    });

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
 * Clean up subcollections when a post is deleted
 * Trigger: onDelete posts/{postId}
 */
export const onPostDeleted = functions.firestore
    .document("posts/{postId}")
    .onDelete(async (snap, context) => {
        const { postId } = context.params;

        try {
            functions.logger.info("Post deleted, cleaning up likes", { postId });

            const likesRef = db.collection(`posts/${postId}/likes`);
            const likesSnapshot = await likesRef.get();

            if (likesSnapshot.empty) {
                functions.logger.info("No likes to clean up", { postId });
                return;
            }

            const batchSize = 450;
            const batches: admin.firestore.WriteBatch[] = [];
            let currentBatch = db.batch();
            let operationCount = 0;

            likesSnapshot.docs.forEach((doc) => {
                currentBatch.delete(doc.ref);
                operationCount++;

                if (operationCount === batchSize) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationCount = 0;
                }
            });

            if (operationCount > 0) {
                batches.push(currentBatch);
            }

            await Promise.all(batches.map(batch => batch.commit()));

            functions.logger.info("Likes cleaned up", {
                postId,
                totalDeleted: likesSnapshot.size,
                batchCount: batches.length
            });
        } catch (error) {
            functions.logger.error("Failed to clean up post likes", {
                postId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });
