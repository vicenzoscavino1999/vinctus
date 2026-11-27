import {
  createAIResponseReport as createAIResponseReportRaw,
  type UserReportReason,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';

export type { UserReportReason };

/** Reports an AI reply (chat or Arena) to the moderation queue, like the native app. */
export const reportAIResponse = async (input: {
  reporterUid: string;
  /** "chat" or `arena_<debateId>`. */
  contextId: string;
  excerpt: string;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> => {
  try {
    return await createAIResponseReportRaw(input);
  } catch (error) {
    throw toAppError(error, { operation: 'ai.reportAIResponse' });
  }
};
