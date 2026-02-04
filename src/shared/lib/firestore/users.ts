export type AccountVisibility = 'public' | 'private';

export interface PublicUserRead {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  accountVisibility?: AccountVisibility;
}
