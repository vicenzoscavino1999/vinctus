import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import type { AccountVisibility } from './users';
import { COLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

export async function getAccountVisibilityServer(uid: string): Promise<AccountVisibility> {
  try {
    trackFirestoreRead('firestore.getDocFromServer');
    const snap = await getDocFromServer(doc(db, COLLECTIONS.usersPublic, uid));
    const data = snap.data() as { accountVisibility?: AccountVisibility } | undefined;
    return data?.accountVisibility === 'private' ? 'private' : 'public';
  } catch {
    try {
      trackFirestoreRead('firestore.getDoc');
      const snap = await getDoc(doc(db, COLLECTIONS.usersPublic, uid));
      const data = snap.data() as { accountVisibility?: AccountVisibility } | undefined;
      return data?.accountVisibility === 'private' ? 'private' : 'public';
    } catch {
      return 'public';
    }
  }
}
