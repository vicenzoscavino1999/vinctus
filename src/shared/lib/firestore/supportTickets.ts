import { collection, doc, serverTimestamp, setDoc, type FieldValue } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';

export type SupportTicketType = 'issue' | 'feature';

export interface SupportTicketContext {
  path: string;
  href: string;
  userAgent: string;
  platform: string;
  locale: string;
  screen: {
    width: number;
    height: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  timezoneOffset: number;
}

export interface SupportTicketWrite {
  uid: string;
  email: string | null;
  type: SupportTicketType;
  title: string;
  message: string;
  context: SupportTicketContext | null;
  appVersion: string;
  status: 'open';
  createdAt: FieldValue;
}

export async function createSupportTicket(input: {
  uid: string;
  email: string | null;
  type: SupportTicketType;
  title: string;
  message: string;
  context: SupportTicketContext | null;
  appVersion: string;
}): Promise<string> {
  const ticketRef = doc(collection(db, 'support_tickets'));
  await setDoc(
    ticketRef,
    {
      uid: input.uid,
      email: input.email ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      context: input.context ?? null,
      appVersion: input.appVersion,
      status: 'open',
      createdAt: serverTimestamp(),
    } as SupportTicketWrite,
    { merge: false },
  );
  return ticketRef.id;
}
