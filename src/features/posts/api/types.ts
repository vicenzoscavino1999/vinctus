import type { PostMedia } from '@/shared/lib/firestore';

export type {
  PaginatedResult,
  PostCommentRead,
  PostRead,
  PostMedia,
  StoryMediaType,
  StoryRead,
} from '@/shared/lib/firestore';

export type FeedPost = {
  postId: string;
  authorId: string | null;
  authorName: string;
  authorPhoto: string | null;
  title: string | null;
  text: string;
  status: 'ready' | 'uploading' | 'failed';
  media: PostMedia[];
  createdAt: unknown;
  likeCount: number;
  commentCount: number;
};
