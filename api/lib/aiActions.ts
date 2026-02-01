import { admin, getDb } from './firebaseAdmin.js';

export type CreateGroupVisibility = 'public' | 'private';

export interface CreateGroupArgs {
    name: string;
    description?: string | null;
    visibility?: CreateGroupVisibility | null;
}

export interface CreateGroupResult {
    groupId: string;
    name: string;
    visibility: CreateGroupVisibility;
}

const sanitizeName = (value: string): string => value.trim().slice(0, 80);
const sanitizeDescription = (value: string): string => value.trim().slice(0, 600);

export async function createGroupAction(
    ownerUid: string,
    args: CreateGroupArgs
): Promise<CreateGroupResult> {
    const db = getDb();
    const name = sanitizeName(args.name || '');
    if (!name) {
        throw new Error('El nombre del grupo es obligatorio.');
    }

    const visibility: CreateGroupVisibility = args.visibility === 'private' ? 'private' : 'public';
    const descriptionInput = args.description ?? '';
    const description = sanitizeDescription(descriptionInput) || 'Grupo creado por asistente.';

    const groupRef = db.collection('groups').doc();
    const memberRef = db.doc(`groups/${groupRef.id}/members/${ownerUid}`);
    const membershipRef = db.doc(`users/${ownerUid}/memberships/${groupRef.id}`);

    const batch = db.batch();
    batch.set(groupRef, {
        name,
        description,
        categoryId: null,
        visibility,
        ownerId: ownerUid,
        iconUrl: null,
        memberCount: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(memberRef, {
        uid: ownerUid,
        groupId: groupRef.id,
        role: 'admin',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(membershipRef, {
        groupId: groupRef.id,
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { groupId: groupRef.id, name, visibility };
}
