import type { DocumentSnapshot, FieldValue, Timestamp } from 'firebase/firestore';
import type { AccountVisibility } from '@/shared/lib/firestore/users';

export interface GroupMemberRead {
  uid: string;
  groupId: string;
  role: 'member' | 'moderator' | 'admin';
  joinedAt: Timestamp;
}

export interface UserMembershipRead {
  groupId: string;
  joinedAt: Timestamp;
}

export interface PostLikeRead {
  uid: string;
  postId: string;
  createdAt: Timestamp;
}

export interface UserLikeRead {
  postId: string;
  createdAt: Timestamp;
}

export type ActivityType = 'post_like' | 'post_comment' | 'follow';

export interface ActivityRead {
  id: string;
  type: ActivityType;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: Date;
  read: boolean;
}

export interface ActivityWrite {
  type: ActivityType;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: FieldValue;
  read: boolean;
}

export interface UserProfileRead {
  uid: string;
  displayName: string | null;
  displayNameLowercase: string | null;
  photoURL: string | null;
  email: string | null;
  bio: string | null;
  role: string | null;
  location: string | null;
  username: string | null;
  reputation: number;
  karmaGlobal?: number;
  karmaByInterest?: Record<string, number>;
  accountVisibility: AccountVisibility;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileUpdate {
  displayName?: string;
  photoURL?: string | null;
  bio?: string;
  role?: string;
  location?: string;
  username?: string;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsOnly: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

export interface PrivacySettings {
  accountVisibility: AccountVisibility;
  allowDirectMessages: boolean;
  showOnlineStatus: boolean;
  showLastActive: boolean;
  allowFriendRequests: boolean;
  blockedUsers: string[];
}

export interface UserSettingsRead {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

export interface GroupMemberWrite {
  uid: string;
  groupId: string;
  role: 'member' | 'moderator' | 'admin';
  joinedAt: FieldValue;
}

export interface UserMembershipWrite {
  groupId: string;
  joinedAt: FieldValue;
}

export interface PostLikeWrite {
  uid: string;
  postId: string;
  createdAt: FieldValue;
}

export interface UserLikeWrite {
  postId: string;
  createdAt: FieldValue;
}

export interface FirestoreGroup {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  visibility?: GroupVisibility;
  ownerId?: string;
  iconUrl?: string | null;
  memberCount?: number;
  apiQuery?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GroupVisibility = 'public' | 'private';

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsOnly: false,
  weeklyDigest: false,
  productUpdates: true,
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  accountVisibility: 'public',
  allowDirectMessages: true,
  showOnlineStatus: true,
  showLastActive: true,
  allowFriendRequests: true,
  blockedUsers: [],
};

export interface CreateGroupInput {
  name: string;
  description: string;
  categoryId: string | null;
  visibility: GroupVisibility;
  iconUrl: string | null;
}

export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface GroupJoinRequestRead {
  id: string;
  groupId: string;
  groupName: string;
  fromUid: string;
  toUid: string;
  status: GroupJoinRequestStatus;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EventVisibility = 'public' | 'private';

export interface FirestoreEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  attendeesCount: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateEventInput {
  title: string;
  description: string | null;
  startAt: Date;
  endAt?: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  coverUrl?: string | null;
}

export interface EventWrite {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface EventAttendeeRead {
  uid: string;
  joinedAt: Date;
}

export interface EventAttendeeWrite {
  uid: string;
  joinedAt: FieldValue;
}

export type GroupJoinStatus = 'member' | 'pending' | 'none';
