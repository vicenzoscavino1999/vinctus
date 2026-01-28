/**
 * Backfill users/{uid}/directConversations from conversations.
 *
 * Usage:
 *   node backfill-direct-conversations.js --mode=report
 *   node backfill-direct-conversations.js --mode=create
 *
 * Notes:
 * - Uses Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS or default).
 * - Creates per-user index docs for direct conversations.
 */

const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'report';

const allowedModes = new Set(['report', 'create']);
if (!allowedModes.has(mode)) {
    console.error('Invalid mode. Use --mode=report or --mode=create.');
    process.exit(1);
}

const PAGE_SIZE = 500;

function parseDirectMemberIds(conversationId, data) {
    const memberIds = Array.isArray(data?.memberIds)
        ? data.memberIds.filter((id) => typeof id === 'string')
        : [];
    if (memberIds.length === 2) {
        return memberIds;
    }

    if (!conversationId.startsWith('dm_')) {
        return [];
    }

    const parts = conversationId.slice(3).split('_').filter(Boolean);
    return parts.length === 2 ? parts : [];
}

async function main() {
    console.log(`Starting direct conversation index ${mode}...`);

    const docId = admin.firestore.FieldPath.documentId();
    let lastDoc = null;
    let scanned = 0;
    let directFound = 0;
    let skipped = 0;
    let writes = 0;

    while (true) {
        let query = db.collection('conversations').orderBy(docId).limit(PAGE_SIZE);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            break;
        }

        for (const docSnap of snapshot.docs) {
            scanned += 1;
            const conversationId = docSnap.id;
            const data = docSnap.data() || {};
            const isDirect = data.type === 'direct' || conversationId.startsWith('dm_');
            if (!isDirect) {
                continue;
            }

            directFound += 1;
            const memberIds = parseDirectMemberIds(conversationId, data);
            if (memberIds.length !== 2) {
                skipped += 1;
                continue;
            }

            if (mode === 'create') {
                const [uid1, uid2] = memberIds;
                const updatedAt = data.updatedAt || admin.firestore.FieldValue.serverTimestamp();
                await Promise.all([
                    db.doc(`users/${uid1}/directConversations/${conversationId}`).set({
                        conversationId,
                        otherUid: uid2,
                        type: 'direct',
                        updatedAt
                    }, { merge: true }),
                    db.doc(`users/${uid2}/directConversations/${conversationId}`).set({
                        conversationId,
                        otherUid: uid1,
                        type: 'direct',
                        updatedAt
                    }, { merge: true })
                ]);
                writes += 2;
            }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log('Done.');
    console.log(`Scanned conversations: ${scanned}`);
    console.log(`Direct conversations: ${directFound}`);
    console.log(`Skipped (missing members): ${skipped}`);
    if (mode === 'create') {
        console.log(`Index docs written: ${writes}`);
    }
}

main().catch((error) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
