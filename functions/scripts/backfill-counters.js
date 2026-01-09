/**
 * Backfill script to initialize counters for existing data
 * Run this ONCE after deploying functions if you already have data in Firestore
 * 
 * Usage: node backfill-counters.js
 */

const admin = require('firebase-admin');

// Initialize admin (uses default credentials or GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp();
const db = admin.firestore();

/**
 * Backfill memberCount for all groups
 */
async function backfillGroupCounters() {
    console.log('🔄 Backfilling group member counters...');

    const groupsSnapshot = await db.collection('groups').get();

    if (groupsSnapshot.empty) {
        console.log('⚠️  No groups found');
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const groupDoc of groupsSnapshot.docs) {
        try {
            const groupId = groupDoc.id;
            const membersSnapshot = await db
                .collection(`groups/${groupId}/members`)
                .get();

            const memberCount = membersSnapshot.size;

            await groupDoc.ref.update({
                memberCount: memberCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`  ✅ ${groupId}: ${memberCount} members`);
            successCount++;
        } catch (error) {
            console.error(`  ❌ ${groupDoc.id}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n📊 Groups Summary:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
}

/**
 * Backfill likesCount for all posts
 */
async function backfillPostCounters() {
    console.log('\n🔄 Backfilling post likes counters...');

    const postsSnapshot = await db.collection('posts').get();

    if (postsSnapshot.empty) {
        console.log('⚠️  No posts found');
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const postDoc of postsSnapshot.docs) {
        try {
            const postId = postDoc.id;
            const likesSnapshot = await db
                .collection(`posts/${postId}/likes`)
                .get();

            const likesCount = likesSnapshot.size;

            await postDoc.ref.update({
                likesCount: likesCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`  ✅ ${postId}: ${likesCount} likes`);
            successCount++;
        } catch (error) {
            console.error(`  ❌ ${postDoc.id}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n📊 Posts Summary:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Starting backfill process...\n');

    try {
        await backfillGroupCounters();
        await backfillPostCounters();

        console.log('\n✅ Backfill complete!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Backfill failed:', error);
        process.exit(1);
    }
}

main();
