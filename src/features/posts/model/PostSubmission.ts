import {
  createPostUploading,
  updatePost,
  type CreatePostUploadingInput,
} from '@/features/posts/api';
import {
  uploadPostMedia,
  type PostMediaUploadItem,
  type PostMediaUploadResult,
} from '@/shared/lib/storage';

/** One immutable draft owns its post ID and upload paths through every retry. */
export class PostSubmission {
  private uploaded: PostMediaUploadResult[] | null = null;
  private ready = false;

  constructor(
    readonly input: CreatePostUploadingInput,
    private readonly files: PostMediaUploadItem[],
    private readonly extra: PostMediaUploadResult[] = [],
  ) {}

  async publish(onProgress: (total: number, transferred: number) => void): Promise<string> {
    if (!this.ready) {
      await createPostUploading(this.input);
      this.uploaded ??= await uploadPostMedia(
        this.files,
        this.input.authorId,
        this.input.postId,
        onProgress,
      );
      await updatePost(this.input.postId, {
        media: [...this.uploaded, ...this.extra],
        status: 'ready',
      });
      this.ready = true;
    }
    return this.input.postId;
  }
}
