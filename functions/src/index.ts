/**
 * Vinctus Cloud Functions
 * Production-ready atomic counters and triggers
 * 
 * Features:
 * - Atomic memberCount for groups
 * - Atomic likesCount for posts
 * - Cascade cleanup on delete
 * - Error handling and logging
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ==========================================================
// 📈 GROUP MEMBER COUNTERS (Atomic)
// ==========================================================

/**
 * Increment memberCount when a user joins a group
 * Trigger: onCreate groups/{groupId}/members/{userId}
 */
export const onGroupMemberCreated = functions.firestore
    .document("groups/{groupId}/members/{userId}")
    .onCreate(async (snap, context) => {
        const { groupId, userId } = context.params;

        try {
            functions.logger.info("Member joined group", {
                groupId,
                userId,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Atomic increment - handles concurrent joins safely
            await db.doc(`groups/${groupId}`).update({
                memberCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            functions.logger.info("Member count incremented", { groupId });
        } catch (error) {
            functions.logger.error("Failed to increment member count", {
                groupId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
            // Don't throw - we don't want to fail the user's join action
            // The count will be slightly off but can be recalculated later
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

        try {
            functions.logger.info("Member left group", { groupId, userId });

            // Get current count to prevent negative values
            const groupDoc = await db.doc(`groups/${groupId}`).get();
            const currentCount = groupDoc.data()?.memberCount || 0;

            if (currentCount > 0) {
                await db.doc(`groups/${groupId}`).update({
                    memberCount: admin.firestore.FieldValue.increment(-1),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                functions.logger.info("Member count decremented", { groupId });
            } else {
                functions.logger.warn("Member count already at 0", { groupId });
            }
        } catch (error) {
            functions.logger.error("Failed to decrement member count", {
                groupId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// ❤️ POST LIKE COUNTERS (Atomic)
// ==========================================================

/**
 * Increment likesCount when a user likes a post
 * Trigger: onCreate posts/{postId}/likes/{userId}
 */
export const onPostLikeCreated = functions.firestore
    .document("posts/{postId}/likes/{userId}")
    .onCreate(async (snap, context) => {
        const { postId, userId } = context.params;

        try {
            functions.logger.info("Post liked", { postId, userId });

            await db.doc(`posts/${postId}`).update({
                likesCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            functions.logger.info("Likes count incremented", { postId });
        } catch (error) {
            functions.logger.error("Failed to increment likes count", {
                postId,
                userId,
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

        try {
            functions.logger.info("Post unliked", { postId, userId });

            const postDoc = await db.doc(`posts/${postId}`).get();
            const currentCount = postDoc.data()?.likesCount || 0;

            if (currentCount > 0) {
                await db.doc(`posts/${postId}`).update({
                    likesCount: admin.firestore.FieldValue.increment(-1),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                functions.logger.info("Likes count decremented", { postId });
            } else {
                functions.logger.warn("Likes count already at 0", { postId });
            }
        } catch (error) {
            functions.logger.error("Failed to decrement likes count", {
                postId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

// ==========================================================
// 🧹 CASCADE CLEANUP (Optional but Recommended)
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
