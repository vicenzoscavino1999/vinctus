import {
  doc,
  getDoc as _getDoc,
  onSnapshot as _onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc as _updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  trackFirestoreListener,
  trackFirestoreRead,
  trackFirestoreWrite,
} from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

type AccountVisibility = 'public' | 'private';

interface UserProfileReadModel {
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

interface UserProfileUpdateInput {
  displayName?: string;
  photoURL?: string | null;
  bio?: string;
  role?: string;
  location?: string;
  username?: string;
}

interface NotificationSettingsInput {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsOnly: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

interface PrivacySettingsInput {
  accountVisibility: AccountVisibility;
  allowDirectMessages: boolean;
  showOnlineStatus: boolean;
  showLastActive: boolean;
  allowFriendRequests: boolean;
  blockedUsers: string[];
}

interface UserSettingsReadModel {
  notifications: NotificationSettingsInput;
  privacy: PrivacySettingsInput;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsInput = {
  pushEnabled: true,
  emailEnabled: false,
  mentionsOnly: false,
  weeklyDigest: true,
  productUpdates: false,
};

const DEFAULT_PRIVACY_SETTINGS: PrivacySettingsInput = {
  accountVisibility: 'public',
  allowDirectMessages: true,
  showOnlineStatus: true,
  showLastActive: true,
  allowFriendRequests: true,
  blockedUsers: [],
};

const resolveSnapshotSize = (value: unknown): number => {
  if (typeof value !== 'object' || value === null || !('size' in value)) return 1;
  const size = (value as { size?: unknown }).size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return 1;
  return Math.max(1, Math.floor(size));
};

const trackSnapshotRead = (snapshot: unknown): void => {
  trackFirestoreRead('firestore.onSnapshot', resolveSnapshotSize(snapshot));
};

const wrapSnapshotHandler = (handler: unknown): unknown => {
  if (typeof handler !== 'function') return handler;

  return (snapshot: unknown, ...rest: unknown[]) => {
    trackSnapshotRead(snapshot);
    return (handler as (...args: unknown[]) => unknown)(snapshot, ...rest);
  };
};

const wrapSnapshotObserver = (observer: unknown): unknown => {
  if (typeof observer !== 'object' || observer === null || !('next' in observer)) {
    return observer;
  }
  const next = (observer as { next?: unknown }).next;
  if (typeof next !== 'function') return observer;

  const typedObserver = observer as {
    next: (snapshot: unknown, ...rest: unknown[]) => unknown;
  };

  return {
    ...typedObserver,
    next: (snapshot: unknown, ...rest: unknown[]) => {
      trackSnapshotRead(snapshot);
      return typedObserver.next(snapshot, ...rest);
    },
  };
};

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const observeSnapshot = ((...args: unknown[]) => {
  const wrappedArgs = [...args];
  if (wrappedArgs.length > 1) {
    const rawSecond = wrappedArgs[1];
    const maybeObserver = wrapSnapshotObserver(rawSecond);
    wrappedArgs[1] = maybeObserver;

    if (maybeObserver === rawSecond) {
      wrappedArgs[1] = wrapSnapshotHandler(rawSecond);
    }
  }

  if (wrappedArgs.length > 2) {
    wrappedArgs[2] = wrapSnapshotHandler(wrappedArgs[2]);
  }

  const unsubscribe = (_onSnapshot as (...innerArgs: unknown[]) => Unsubscribe)(...wrappedArgs);
  return trackFirestoreListener('firestore.onSnapshot', unsubscribe);
}) as typeof _onSnapshot;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

/**
 * Get user profile by UID
 * Handles multiple scenarios:
 * - User exists in private 'users' collection
 * - User only exists in public 'users_public' collection
 * - Permission denied on 'users' collection (fallback to public)
 * - Missing fields in 'users' (complement with 'users_public')
 */
export async function getUserProfile(uid: string): Promise<UserProfileReadModel | null> {
  let privateData = null;
  let publicData = null;

  // 1. Try private collection (might fail with permission-denied)
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      privateData = userDoc.data();
    }
  } catch (error: any) {
    // Log permission-denied for debugging
    if (error?.code === 'permission-denied') {
      console.log(
        '[getUserProfile] Permission denied for users/' + uid + ', falling back to public',
      );
    }
  }

  // 2. Load public data (always, for fallback or complementing)
  try {
    const publicDoc = await getDoc(doc(db, 'users_public', uid));
    if (publicDoc.exists()) {
      publicData = publicDoc.data();
    }
  } catch (error) {
    console.error('[getUserProfile] Error loading public data:', error);
  }

  // 3. If neither exists, user not found
  if (!privateData && !publicData) {
    console.log('[getUserProfile] User not found in users or users_public: ' + uid);
    return null;
  }

  const accountVisibility =
    privateData?.settings?.privacy?.accountVisibility === 'private'
      ? 'private'
      : publicData?.accountVisibility === 'private'
        ? 'private'
        : 'public';
  const followersCount =
    typeof publicData?.followersCount === 'number'
      ? publicData.followersCount
      : typeof privateData?.followersCount === 'number'
        ? privateData.followersCount
        : 0;
  const followingCount =
    typeof publicData?.followingCount === 'number'
      ? publicData.followingCount
      : typeof privateData?.followingCount === 'number'
        ? privateData.followingCount
        : 0;
  const postsCount =
    typeof publicData?.postsCount === 'number'
      ? publicData.postsCount
      : typeof privateData?.postsCount === 'number'
        ? privateData.postsCount
        : 0;
  const reputation =
    typeof privateData?.reputation === 'number'
      ? privateData.reputation
      : typeof publicData?.reputation === 'number'
        ? publicData.reputation
        : 0;
  const karmaGlobal =
    typeof privateData?.karmaGlobal === 'number'
      ? privateData.karmaGlobal
      : typeof publicData?.karmaGlobal === 'number'
        ? publicData.karmaGlobal
        : undefined;
  const karmaByInterest = (privateData?.karmaByInterest ?? publicData?.karmaByInterest) as
    | Record<string, number>
    | undefined;

  // 4. Merge data (private first, complement with public)
  return {
    uid: uid,
    displayName: privateData?.displayName ?? publicData?.displayName ?? null,
    displayNameLowercase:
      privateData?.displayNameLowercase ?? publicData?.displayNameLowercase ?? null,
    photoURL: privateData?.photoURL ?? publicData?.photoURL ?? null,
    email: privateData?.email ?? null,
    bio: privateData?.bio ?? null,
    role: privateData?.role ?? null,
    location: privateData?.location ?? null,
    username: privateData?.username ?? publicData?.username ?? null,
    reputation,
    karmaGlobal,
    karmaByInterest,
    accountVisibility,
    followersCount,
    followingCount,
    postsCount,
    createdAt: toDate(privateData?.createdAt ?? publicData?.createdAt) ?? new Date(),
    updatedAt: toDate(privateData?.updatedAt ?? publicData?.updatedAt) ?? new Date(),
  };
}

/**
 * Update user profile
 * Updates both 'users' (private) and 'users_public' (public) collections
 */
export async function updateUserProfile(
  uid: string,
  updates: UserProfileUpdateInput,
): Promise<void> {
  const batch = writeBatch(db);

  // Build updates object
  const userUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const publicUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.displayName !== undefined) {
    userUpdates.displayName = updates.displayName;
    userUpdates.displayNameLowercase = updates.displayName.toLowerCase();
    publicUpdates.displayName = updates.displayName;
    publicUpdates.displayNameLowercase = updates.displayName.toLowerCase();
  }

  if (updates.bio !== undefined) {
    userUpdates.bio = updates.bio;
  }

  if (updates.photoURL !== undefined) {
    userUpdates.photoURL = updates.photoURL;
    publicUpdates.photoURL = updates.photoURL;
  }

  if (updates.role !== undefined) {
    userUpdates.role = updates.role;
  }

  if (updates.location !== undefined) {
    userUpdates.location = updates.location;
  }

  if (updates.username !== undefined) {
    userUpdates.username = updates.username;
    publicUpdates.username = updates.username;
  }

  // Update private user doc
  batch.set(doc(db, 'users', uid), userUpdates, { merge: true });

  // Update public user doc (only public fields)
  batch.set(doc(db, 'users_public', uid), publicUpdates, { merge: true });

  await batch.commit();
}

/**
 * Subscribe to user profile changes
 */
export function subscribeToUserProfile(
  uid: string,
  onData: (profile: UserProfileReadModel | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return observeSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      const privacy = (data.settings?.privacy ?? {}) as Partial<PrivacySettingsInput>;
      const accountVisibility = privacy.accountVisibility === 'private' ? 'private' : 'public';
      onData({
        uid: data.uid || uid,
        displayName: data.displayName || null,
        displayNameLowercase: data.displayNameLowercase || null,
        photoURL: data.photoURL || null,
        email: data.email || null,
        bio: data.bio || null,
        role: data.role || null,
        location: data.location || null,
        username: data.username || null,
        reputation: data.reputation || 0,
        karmaGlobal: typeof data.karmaGlobal === 'number' ? data.karmaGlobal : undefined,
        karmaByInterest:
          typeof data.karmaByInterest === 'object'
            ? (data.karmaByInterest as Record<string, number>)
            : undefined,
        accountVisibility,
        followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
        followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
        postsCount: typeof data.postsCount === 'number' ? data.postsCount : 0,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
      });
    },
    onError,
  );
}

const normalizeNotificationSettings = (value: unknown): NotificationSettingsInput => {
  const data = (value ?? {}) as Partial<NotificationSettingsInput>;
  return {
    pushEnabled:
      typeof data.pushEnabled === 'boolean'
        ? data.pushEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.pushEnabled,
    emailEnabled:
      typeof data.emailEnabled === 'boolean'
        ? data.emailEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
    mentionsOnly:
      typeof data.mentionsOnly === 'boolean'
        ? data.mentionsOnly
        : DEFAULT_NOTIFICATION_SETTINGS.mentionsOnly,
    weeklyDigest:
      typeof data.weeklyDigest === 'boolean'
        ? data.weeklyDigest
        : DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest,
    productUpdates:
      typeof data.productUpdates === 'boolean'
        ? data.productUpdates
        : DEFAULT_NOTIFICATION_SETTINGS.productUpdates,
  };
};

const normalizePrivacySettings = (value: unknown): PrivacySettingsInput => {
  const data = (value ?? {}) as Partial<PrivacySettingsInput>;
  const visibility =
    data.accountVisibility === 'private' || data.accountVisibility === 'public'
      ? data.accountVisibility
      : DEFAULT_PRIVACY_SETTINGS.accountVisibility;
  return {
    accountVisibility: visibility,
    allowDirectMessages:
      typeof data.allowDirectMessages === 'boolean'
        ? data.allowDirectMessages
        : DEFAULT_PRIVACY_SETTINGS.allowDirectMessages,
    showOnlineStatus:
      typeof data.showOnlineStatus === 'boolean'
        ? data.showOnlineStatus
        : DEFAULT_PRIVACY_SETTINGS.showOnlineStatus,
    showLastActive:
      typeof data.showLastActive === 'boolean'
        ? data.showLastActive
        : DEFAULT_PRIVACY_SETTINGS.showLastActive,
    allowFriendRequests:
      typeof data.allowFriendRequests === 'boolean'
        ? data.allowFriendRequests
        : DEFAULT_PRIVACY_SETTINGS.allowFriendRequests,
    blockedUsers: Array.isArray(data.blockedUsers)
      ? data.blockedUsers.filter((uid) => typeof uid === 'string')
      : [],
  };
};

export async function getUserSettings(uid: string): Promise<UserSettingsReadModel> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return {
        notifications: DEFAULT_NOTIFICATION_SETTINGS,
        privacy: DEFAULT_PRIVACY_SETTINGS,
      };
    }
    const data = snap.data() as { settings?: { notifications?: unknown; privacy?: unknown } };
    return {
      notifications: normalizeNotificationSettings(data.settings?.notifications),
      privacy: normalizePrivacySettings(data.settings?.privacy),
    };
  } catch (error) {
    console.error('Error loading user settings:', error);
    return {
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
    };
  }
}

export async function updateNotificationSettings(
  uid: string,
  settings: NotificationSettingsInput,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    'settings.notifications': settings,
  });
}

export async function updatePrivacySettings(
  uid: string,
  settings: PrivacySettingsInput,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    'settings.privacy': settings,
  });
  batch.set(
    doc(db, 'users_public', uid),
    {
      accountVisibility: settings.accountVisibility,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}
