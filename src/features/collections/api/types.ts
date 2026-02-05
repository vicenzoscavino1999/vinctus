import type { DocumentSnapshot } from 'firebase/firestore';

export type {
  CollectionItemRead,
  CollectionItemType,
  CollectionRead,
} from '@/shared/lib/firestore';

export type CreateCollectionInput = {
  name: string;
  icon?: string | null;
};

export type UpdateCollectionInput = CreateCollectionInput;

export type CreateCollectionItemInput = {
  collectionName: string;
  type: import('@/shared/lib/firestore').CollectionItemType;
  title: string;
  url?: string | null;
  text?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  contentType?: string | null;
  storagePath?: string | null;
};

export type CollectionPage<T> = {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
};
