/**
 * Backfill users/{uid}/friends/{friendUid} from friend_requests.
 *
 * Usage:
 *   node backfill-friends.js --mode=report
 *   node backfill-friends.js --mode=create
 *
 * Notes:
 * - Uses Firebase Admin credentials (GOOGLE_APPLICATION_CREDENTIALS or default).
 * - Writes friend index docs for accepted friend requests.
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

async function main() {
    console.log(`Starting friend index ${mode}...`);

    const docId = admin.firestore.FieldPath.documentId();
    let lastDoc = null;
    let scanned = 0;
    let acceptedFound = 0;
    let writes = 0;

    while (true) {
        let query = db.collection('friend_requests').orderBy(docId).limit(PAGE_SIZE);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            break;
        }

        for (const docSnap of snapshot.docs) {
            scanned += 1;
            const data = docSnap.data() || {};
            if (data.status !== 'accepted') {
                continue;
            }

            const fromUid = typeof data.fromUid === 'string' ? data.fromUid : null;
            const toUid = typeof data.toUid === 'string' ? data.toUid : null;
            if (!fromUid || !toUid) {
                continue;
            }

            acceptedFound += 1;

            if (mode === 'create') {
                const payload = {
                    uid: toUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                const reversePayload = {
                    uid: fromUid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };

                await Promise.all([
                    db.doc(`users/${fromUid}/friends/${toUid}`).set(payload, { merge: true }),
                    db.doc(`users/${toUid}/friends/${fromUid}`).set(reversePayload, { merge: true })
                ]);
                writes += 2;
            }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log('Done.');
    console.log(`Scanned friend_requests: ${scanned}`);
    console.log(`Accepted requests: ${acceptedFound}`);
    if (mode === 'create') {
        console.log(`Friend docs written: ${writes}`);
    }
}

main().catch((error) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
