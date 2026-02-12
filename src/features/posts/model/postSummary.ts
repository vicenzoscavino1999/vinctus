import type { PostMedia, PostRead } from '@/shared/lib/firestore/posts';
import { getYouTubeThumbnailUrl } from '@/shared/lib/youtube';

export type PostSummary = {
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  title: string | null;
  text: string;
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  media: PostMedia[];
  createdAt: unknown;
};

type PostSummaryOverrides = Partial<Pick<PostSummary, 'likeCount' | 'commentCount'>>;

export const toPostSummary = (
  post: PostRead,
  overrides: PostSummaryOverrides = {},
): PostSummary => {
  const displayText = post.text?.trim() || post.content?.trim() || '';
  const videoUrl = post.media?.find((item) => item.type === 'video')?.url ?? null;
  const imageUrl =
    post.media?.find((item) => item.type === 'image')?.url ??
    (videoUrl ? getYouTubeThumbnailUrl(videoUrl) : null) ??
    null;

  return {
    postId: post.postId || post.id,
    authorId: post.authorId,
    authorName: post.authorSnapshot?.displayName || post.authorName || 'Usuario',
    authorPhoto: post.authorSnapshot?.photoURL ?? post.authorPhoto ?? null,
    title: post.title ?? null,
    text: displayText,
    imageUrl,
    likeCount:
      typeof overrides.likeCount === 'number'
        ? Math.max(0, overrides.likeCount)
        : Math.max(0, post.likeCount || 0),
    commentCount:
      typeof overrides.commentCount === 'number'
        ? Math.max(0, overrides.commentCount)
        : Math.max(0, post.commentCount || 0),
    media: post.media ?? [],
    createdAt: post.createdAt,
  };
};
