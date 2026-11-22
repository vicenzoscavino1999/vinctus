import { auth } from '@/shared/lib/firebase';
import { readPostRecords } from '@/shared/lib/post-reads-client';
import { normalizePostRead } from '@/shared/lib/firestore/posts';
import type { PaginatedResult, PostRead } from './types';

export async function getSavedPostsRaw(
  uid: string,
  pageSize = 12,
  lastDoc?: string,
): Promise<PaginatedResult<PostRead>> {
  if (auth.currentUser?.uid !== uid) throw new Error('Inicia sesion para ver tus guardados.');
  const page = await readPostRecords({
    view: 'saved',
    limit: pageSize,
    ...(lastDoc ? { cursor: lastDoc } : {}),
  });
  return {
    items: page.items.map((post) => normalizePostRead(String(post.id), post)),
    lastDoc: page.lastDoc,
    hasMore: page.hasMore,
  };
}
