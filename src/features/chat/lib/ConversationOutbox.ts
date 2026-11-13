import {
  sendMessage,
  uploadMessageAttachment,
  type MessageAttachmentRead,
} from '@/features/chat/api';
import { validateChatFile } from '@/shared/lib/chat-media';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

export type PendingFile = { id: string; file: File };
export type OutboxMessage = {
  id: string;
  text: string;
  files: PendingFile[];
  uploaded: Map<string, MessageAttachmentRead>;
};
type Session = {
  draft: string;
  files: PendingFile[];
  failed: OutboxMessage[];
  pending: string | null;
  progress: number;
  error: string | null;
};
const EMPTY: Session = {
  draft: '',
  files: [],
  failed: [],
  pending: null,
  progress: 0,
  error: null,
};
const keyFor = (uid: string, conversationId: string) => JSON.stringify([uid, conversationId]);

/** Drafts and retry IDs belong to a specific account and conversation, including during awaits. */
export class ConversationOutbox {
  private sessions = new Map<string, Session>();
  private listeners = new Set<() => void>();
  constructor(private deps = { send: sendMessage, upload: uploadMessageAttachment }) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = (uid: string, conversationId: string) =>
    this.sessions.get(keyFor(uid, conversationId)) ?? EMPTY;
  private patch(uid: string, id: string, change: Partial<Session>) {
    this.sessions.set(keyFor(uid, id), { ...this.snapshot(uid, id), ...change });
    this.listeners.forEach((listener) => listener());
  }
  draft(uid: string, id: string, draft: string) {
    this.patch(uid, id, { draft });
  }
  add(uid: string, id: string, files: File[]) {
    const state = this.snapshot(uid, id);
    if (state.files.length + files.length > 10)
      throw new Error('Puedes adjuntar hasta 10 archivos por mensaje.');
    files.forEach(validateChatFile);
    this.patch(uid, id, {
      files: [...state.files, ...files.map((file) => ({ id: crypto.randomUUID(), file }))],
      error: null,
    });
  }
  remove(uid: string, id: string, fileId: string) {
    this.patch(uid, id, {
      files: this.snapshot(uid, id).files.filter((file) => file.id !== fileId),
    });
  }
  discard(uid: string, id: string, messageId: string) {
    this.patch(uid, id, {
      failed: this.snapshot(uid, id).failed.filter((message) => message.id !== messageId),
    });
  }
  async send(
    uid: string,
    id: string,
    retry?: OutboxMessage,
    name?: string | null,
    photo?: string | null,
  ) {
    const state = this.snapshot(uid, id);
    if (state.pending) return;
    if (retry && !state.failed.some((message) => message.id === retry.id)) return;
    const message = retry ?? {
      id: crypto.randomUUID(),
      text: state.draft.trim(),
      files: state.files,
      uploaded: new Map<string, MessageAttachmentRead>(),
    };
    if (
      (!message.text && !message.files.length) ||
      message.text.length > LIMITS.messages.textMaxLength
    )
      return;
    this.patch(uid, id, {
      pending: message.id,
      progress: 0,
      error: null,
      ...(retry ? {} : { draft: '', files: [] }),
    });
    try {
      const total = Math.max(
        1,
        message.files.reduce((sum, entry) => sum + entry.file.size, 0),
      );
      let completed = 0;
      for (const entry of message.files) {
        if (!message.uploaded.has(entry.id)) {
          const bytes = completed;
          const uploaded = await this.deps.upload(
            entry.file,
            id,
            uid,
            message.id,
            entry.id,
            (fraction) => {
              if (this.snapshot(uid, id).pending === message.id)
                this.patch(uid, id, { progress: (bytes + fraction * entry.file.size) / total });
            },
          );
          message.uploaded.set(entry.id, uploaded);
        }
        completed += entry.file.size;
      }
      await this.deps.send(
        id,
        uid,
        message.text,
        name,
        photo,
        message.files.map((file) => message.uploaded.get(file.id)!),
        message.id,
      );
      this.patch(uid, id, {
        failed: this.snapshot(uid, id).failed.filter((item) => item.id !== message.id),
        progress: 1,
      });
    } catch (error) {
      const current = this.snapshot(uid, id);
      this.patch(uid, id, {
        failed: retry ? current.failed : [...current.failed, message],
        error: error instanceof Error ? error.message : 'No se pudo enviar el mensaje.',
      });
    } finally {
      this.patch(uid, id, { pending: null });
    }
  }
}
