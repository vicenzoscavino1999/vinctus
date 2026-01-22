/**
 * Backfill group conversations based on users/{uid}/memberships.
 *
 * Usage:
 *   node backfill-group-conversations.js --mode=report
 *   node backfill-group-conversations.js --mode=create
 *
 * Notes:
 * - Uses Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS or default).
 * - Creates conversations/grp_{groupId} and conversations/grp_{groupId}/members/{uid} when missing.
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

async function collectMemberships() {
    const groupMap = new Map();
    const docId = admin.firestore.FieldPath.documentId();
    let lastDoc = null;
    let totalDocs = 0;

    while (true) {
        let query = db.collectionGroup('memberships').orderBy(docId).limit(PAGE_SIZE);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            break;
        }

        snapshot.docs.forEach((docSnap) => {
            totalDocs += 1;
            const groupId = docSnap.id;
            const userId = docSnap.ref.parent.parent?.id;
            if (!groupId || !userId) return;

            const entry = groupMap.get(groupId) || { memberUids: new Set() };
            entry.memberUids.add(userId);
            groupMap.set(groupId, entry);
        });

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return { groupMap, totalDocs };
}

async function backfillGroupConversation(groupId, memberUids) {
    const conversationId = `grp_${groupId}`;
    const convRef = db.doc(`conversations/${conversationId}`);
    const convSnap = await convRef.get();

    let convMissing = false;
    let convPatched = false;

    if (!convSnap.exists) {
        convMissing = true;
        if (mode === 'create') {
            await convRef.set({
                type: 'group',
                groupId,
                lastMessage: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: false });
        }
    } else {
        const data = convSnap.data() || {};
        const updates = {};
        if (data.type !== 'group') {
            updates.type = 'group';
        }
        if (data.groupId !== groupId) {
            updates.groupId = groupId;
        }
        if (Object.keys(updates).length > 0) {
            convPatched = true;
            if (mode === 'create') {
                updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
                await convRef.set(updates, { merge: true });
            }
        }
    }

    let memberMissingCount = 0;

    for (const uid of memberUids) {
        const memberRef = db.doc(`conversations/${conversationId}/members/${uid}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
            memberMissingCount += 1;
            if (mode === 'create') {
                await memberRef.set({
                    uid,
                    role: 'member',
                    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastReadClientAt: Date.now(),
                    lastReadAt: admin.firestore.FieldValue.serverTimestamp(),
                    muted: false
                }, { merge: false });
            }
        }
    }

    return { convMissing, convPatched, memberMissingCount };
}

async function main() {
    console.log(`Starting group conversation ${mode}...`);

    const { groupMap, totalDocs } = await collectMemberships();
    console.log(`Scanned memberships: ${totalDocs}`);
    console.log(`Unique groupIds: ${groupMap.size}`);

    let missingConversations = 0;
    let patchedConversations = 0;
    let missingMembers = 0;

    for (const [groupId, entry] of groupMap.entries()) {
        const result = await backfillGroupConversation(groupId, entry.memberUids);
        if (result.convMissing) {
            missingConversations += 1;
        }
        if (result.convPatched) {
            patchedConversations += 1;
        }
        missingMembers += result.memberMissingCount;
    }

    console.log('Done.');
    console.log(`Missing conversations: ${missingConversations}`);
    console.log(`Patched conversations: ${patchedConversations}`);
    console.log(`Missing conversation members: ${missingMembers}`);
}

main().catch((error) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
