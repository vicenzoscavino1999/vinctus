import { uploadChatAttachment } from '@/shared/lib/storage';
import { validateChatFile } from '@/shared/lib/chat-media';
import { validate, idSchema } from '@/shared/lib/validators';
import { conversationIdSchema, uidSchema, type MessageAttachmentRead } from './types';

export const uploadMessageAttachment = async (
  file: File,
  conversationId: string,
  uid: string,
  messageId: string,
  fileId: string,
  progress: (fraction: number) => void,
): Promise<MessageAttachmentRead> => {
  const type = validateChatFile(file);
  const result = await uploadChatAttachment(
    file,
    validate(conversationIdSchema, conversationId),
    validate(uidSchema, uid),
    validate(idSchema, messageId),
    validate(idSchema, fileId),
    progress,
  );
  return {
    ...result,
    kind: type.startsWith('image/') ? 'image' : 'file',
    fileName: file.name.slice(0, 200),
    contentType: type,
    size: file.size,
  };
};
