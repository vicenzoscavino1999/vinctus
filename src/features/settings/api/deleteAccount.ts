import { httpsCallable } from 'firebase/functions';
import { functions } from '@/shared/lib/firebase';

export type AccountDeletionStatus =
  | 'not_requested'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface StartAccountDeletionResult {
  mode: 'async' | 'legacy';
  status: Exclude<AccountDeletionStatus, 'not_requested'>;
  jobId: string | null;
}

interface DeleteAccountResponse {
  success: boolean;
}

interface RequestAccountDeletionResponse {
  accepted: boolean;
  status: Exclude<AccountDeletionStatus, 'not_requested'>;
  jobId: string;
}

export interface AccountDeletionStatusResponse {
  status: AccountDeletionStatus;
  jobId: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

const isMissingFunctionError = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code || '';
  return code.includes('not-found') || code.includes('unimplemented');
};

export const requestAccountDeletion = async (): Promise<RequestAccountDeletionResponse> => {
  const request = httpsCallable<void, RequestAccountDeletionResponse>(
    functions,
    'requestAccountDeletion',
  );
  const result = await request();
  if (!result.data.accepted) {
    throw new Error('Account deletion request was not accepted');
  }
  return result.data;
};

export const getAccountDeletionStatus = async (): Promise<AccountDeletionStatusResponse> => {
  const getStatus = httpsCallable<void, AccountDeletionStatusResponse>(
    functions,
    'getAccountDeletionStatus',
  );
  const result = await getStatus();
  return result.data;
};

/**
 * Starts account deletion flow.
 * - Preferred path: async deletion job via requestAccountDeletion
 * - Fallback path: direct deleteUserAccount callable (legacy deployments)
 */
export const startAccountDeletion = async (): Promise<StartAccountDeletionResult> => {
  try {
    const result = await requestAccountDeletion();
    return {
      mode: 'async',
      status: result.status,
      jobId: result.jobId,
    };
  } catch (error) {
    if (!isMissingFunctionError(error)) {
      throw error;
    }
  }

  const deleteUserAccount = httpsCallable<void, DeleteAccountResponse>(
    functions,
    'deleteUserAccount',
  );
  const result = await deleteUserAccount();
  if (!result.data.success) {
    throw new Error('Failed to delete account');
  }
  return {
    mode: 'legacy',
    status: 'processing',
    jobId: null,
  };
};

/**
 * Backward-compatible alias.
 */
export const deleteAccount = async (): Promise<void> => {
  await startAccountDeletion();
};
