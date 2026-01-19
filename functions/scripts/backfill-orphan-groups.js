/**
 * Audit or backfill groups that have memberships but are missing groups/{groupId}.
 *
 * Usage:
 *   node backfill-orphan-groups.js --mode=report
 *   node backfill-orphan-groups.js --mode=create
 *   node backfill-orphan-groups.js --mode=create --visibility=public
 *
 * Notes:
 * - Uses Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS or default).
 * - "create" mode creates placeholder group docs with legacyPlaceholder: true.
 */

const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'report';

const visibilityArg = args.find((arg) => arg.startsWith('--visibility='));
const visibility = visibilityArg ? visibilityArg.split('=')[1] : 'private';

const allowedModes = new Set(['report', 'create']);
const allowedVisibility = new Set(['public', 'private']);
if (!allowedModes.has(mode)) {
    console.error('Invalid mode. Use --mode=report or --mode=create.');
    process.exit(1);
}
if (!allowedVisibility.has(visibility)) {
    console.error('Invalid visibility. Use --visibility=public or --visibility=private.');
    process.exit(1);
}

const PAGE_SIZE = 500;

async function collectGroupMemberships() {
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

async function resolveOwnerAndCounts(groupId, memberUids) {
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();

    let ownerId = null;
    let earliestJoined = null;

    membersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const role = data.role;
        const uid = data.uid || docSnap.id;
        const joinedAt = data.joinedAt;

        if (!ownerId && role === 'admin' && uid) {
            ownerId = uid;
        }

        if (joinedAt && typeof joinedAt.toMillis === 'function') {
            if (!earliestJoined || joinedAt.toMillis() < earliestJoined.toMillis()) {
                earliestJoined = joinedAt;
            }
        }
    });

    if (!ownerId) {
        const iterator = memberUids.values();
        const first = iterator.next();
        if (!first.done) {
            ownerId = first.value;
        }
    }

    const memberCount = membersSnap.size > 0 ? membersSnap.size : memberUids.size;

    return { ownerId, memberCount, earliestJoined, membersSnapSize: membersSnap.size };
}

async function main() {
    console.log(`Starting orphan group ${mode}...`);

    const { groupMap, totalDocs } = await collectGroupMemberships();
    console.log(`Scanned memberships: ${totalDocs}`);
    console.log(`Unique groupIds: ${groupMap.size}`);

    const missing = [];

    for (const [groupId, entry] of groupMap.entries()) {
        const groupRef = db.doc(`groups/${groupId}`);
        const groupSnap = await groupRef.get();
        if (!groupSnap.exists) {
            missing.push({ groupId, memberUids: entry.memberUids });
        }
    }

    if (missing.length === 0) {
        console.log('No missing group documents found.');
        return;
    }

    console.log(`Missing group docs: ${missing.length}`);

    if (mode === 'report') {
        missing.forEach((item) => {
            console.log(`- groups/${item.groupId} (memberships: ${item.memberUids.size})`);
        });
        return;
    }

    let created = 0;
    let skipped = 0;

    for (const item of missing) {
        const { groupId, memberUids } = item;
        try {
            const { ownerId, memberCount, earliestJoined, membersSnapSize } = await resolveOwnerAndCounts(
                groupId,
                memberUids
            );

            if (!ownerId) {
                console.warn(`Skipping ${groupId}: could not determine ownerId.`);
                skipped += 1;
                continue;
            }

            if (membersSnapSize === 0) {
                console.warn(`Warning: groups/${groupId}/members is empty. Using memberships only.`);
            }

            const groupData = {
                name: `Grupo legado ${groupId}`,
                description: 'Grupo restaurado automaticamente. Actualiza su informacion.',
                categoryId: null,
                visibility,
                ownerId,
                iconUrl: null,
                memberCount,
                createdAt: earliestJoined || admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                legacyPlaceholder: true
            };

            await db.doc(`groups/${groupId}`).set(groupData, { merge: false });
            created += 1;
            console.log(`Created groups/${groupId} (ownerId: ${ownerId}, members: ${memberCount})`);
        } catch (error) {
            console.error(`Failed to create groups/${groupId}:`, error instanceof Error ? error.message : String(error));
            skipped += 1;
        }
    }

    console.log(`Done. Created: ${created}, Skipped: ${skipped}`);
}

main().catch((error) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
