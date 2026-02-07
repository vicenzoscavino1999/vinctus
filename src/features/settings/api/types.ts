import { z } from 'zod';
import type {
  NotificationSettings,
  PrivacySettings,
  UserSettingsRead,
} from '@/shared/lib/firestore';
import { idSchema } from '@/shared/lib/validators';

export type { NotificationSettings, PrivacySettings, UserSettingsRead };

export const uidSchema = idSchema;
export const accountVisibilitySchema = z.enum(['public', 'private']);

export const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  mentionsOnly: z.boolean(),
  weeklyDigest: z.boolean(),
  productUpdates: z.boolean(),
});

export const privacySettingsSchema = z.object({
  accountVisibility: accountVisibilitySchema,
  allowDirectMessages: z.boolean(),
  showOnlineStatus: z.boolean(),
  showLastActive: z.boolean(),
  allowFriendRequests: z.boolean(),
  blockedUsers: z.array(idSchema).max(1000),
});

export const userSettingsReadSchema = z.object({
  notifications: notificationSettingsSchema,
  privacy: privacySettingsSchema,
});
