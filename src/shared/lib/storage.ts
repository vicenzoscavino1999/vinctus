import {
  ref,
  uploadBytesResumable,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';

type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
};

/**
 * Upload single image with progress tracking
 * Returns Promise with URL and storage path
 */
export function uploadPostImage(
  file: File,
  userId: string,
  postId: string,
  index: number,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const storagePath = `posts/${userId}/${postId}/images/${index}.webp`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir imagen'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Upload multiple images with aggregate progress
 * Returns array of {url, path} or throws on first failure
 */
export async function uploadPostImages(
  files: File[],
  userId: string,
  postId: string,
  onProgress?: (totalBytes: number, transferredBytes: number) => void,
): Promise<Array<{ url: string; path: string; type: 'image' }>> {
  const progressMap: { [key: number]: UploadProgress } = {};

  const uploads = files.map((file, index) =>
    uploadPostImage(file, userId, postId, index, (progress) => {
      progressMap[index] = progress;

      // Calculate aggregate progress by bytes
      if (onProgress) {
        const totalBytes = Object.values(progressMap).reduce((sum, p) => sum + p.totalBytes, 0);
        const transferredBytes = Object.values(progressMap).reduce(
          (sum, p) => sum + p.bytesTransferred,
          0,
        );
        onProgress(totalBytes, transferredBytes);
      }
    }),
  );

  // Use allSettled to track which uploads succeeded/failed
  const results = await Promise.allSettled(uploads);

  // Check if any failed
  const failed = results.filter((r) => r.status === 'rejected');
  const successful = results
    .map((r, index) => (r.status === 'fulfilled' ? { result: r.value, index } : null))
    .filter((x): x is { result: { url: string; path: string }; index: number } => x !== null);

  // If ANY failed, cleanup all successful uploads to prevent orphans
  if (failed.length > 0) {
    await Promise.all(
      successful.map(async (s) => {
        try {
          await deleteObject(ref(storage, s.result.path));
        } catch (cleanupError) {
          console.error(`Cleanup failed for image ${s.index}:`, cleanupError);
        }
      }),
    );

    // Throw the first error
    const firstError = failed[0];
    throw firstError.status === 'rejected' ? firstError.reason : new Error('Upload failed');
  }

  // All succeeded, return results with type
  return successful.map((s) => ({ ...s.result, type: 'image' as const }));
}

type PostMediaUploadItem = {
  kind: 'image' | 'video' | 'file';
  file: File;
};

type PostMediaUploadResult = {
  url: string;
  path: string;
  type: 'image' | 'video' | 'file';
  contentType?: string;
  fileName?: string;
  size?: number;
};

const buildPostMediaPath = (
  kind: PostMediaUploadItem['kind'],
  userId: string,
  postId: string,
  fileName: string,
): string => {
  const safeName = sanitizeFileName(fileName);
  const storageName = `${Date.now()}_${safeName}`;
  if (kind === 'video') {
    return `posts/${userId}/${postId}/videos/${storageName}`;
  }
  if (kind === 'file') {
    return `posts/${userId}/${postId}/files/${storageName}`;
  }
  return `posts/${userId}/${postId}/images/${storageName}`;
};

/**
 * Upload mixed media (images, videos, files) for a post with aggregate progress
 */
export async function uploadPostMedia(
  items: PostMediaUploadItem[],
  userId: string,
  postId: string,
  onProgress?: (totalBytes: number, transferredBytes: number) => void,
): Promise<PostMediaUploadResult[]> {
  const progressMap: { [key: number]: UploadProgress } = {};

  const uploads = items.map(
    (item, index) =>
      new Promise<PostMediaUploadResult>((resolve, reject) => {
        const storagePath = buildPostMediaPath(item.kind, userId, postId, item.file.name);
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, item.file);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            progressMap[index] = {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
            };
            if (onProgress) {
              const totalBytes = Object.values(progressMap).reduce(
                (sum, p) => sum + p.totalBytes,
                0,
              );
              const transferredBytes = Object.values(progressMap).reduce(
                (sum, p) => sum + p.bytesTransferred,
                0,
              );
              onProgress(totalBytes, transferredBytes);
            }
          },
          (error) => {
            console.error('Upload failed:', error);
            reject(new Error('Error al subir el archivo'));
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              const result: PostMediaUploadResult = {
                url,
                path: uploadTask.snapshot.ref.fullPath,
                type: item.kind,
                contentType: item.file.type || 'application/octet-stream',
              };
              if (item.kind === 'file') {
                result.fileName = item.file.name;
                result.size = item.file.size;
              }
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
        );
      }),
  );

  const results = await Promise.allSettled(uploads);
  const failed = results.filter((r) => r.status === 'rejected');
  const successful = results
    .map((r, index) => (r.status === 'fulfilled' ? { result: r.value, index } : null))
    .filter((x): x is { result: PostMediaUploadResult; index: number } => x !== null);

  if (failed.length > 0) {
    await Promise.all(
      successful.map(async (s) => {
        try {
          await deleteObject(ref(storage, s.result.path));
        } catch (cleanupError) {
          console.error(`Cleanup failed for media ${s.index}:`, cleanupError);
        }
      }),
    );
    const firstError = failed[0];
    throw firstError.status === 'rejected' ? firstError.reason : new Error('Upload failed');
  }

  const ordered = successful.sort((a, b) => a.index - b.index).map((s) => s.result);
  return ordered;
}

/**
 * Delete media file from Storage
 */
export async function deletePostMedia(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.error('Delete failed:', error);
    throw new Error('No se pudo eliminar el archivo');
  }
}

/**
 * Delete all media for a post
 */
export async function deletePostAllMedia(mediaPaths: string[]): Promise<void> {
  await Promise.all(mediaPaths.map((path) => deletePostMedia(path)));
}

const sanitizeFileName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return 'archivo';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Upload collection file with progress tracking
 * Returns Promise with URL, storage path, and file metadata
 */
export function uploadCollectionFile(
  file: File,
  userId: string,
  collectionId: string,
  itemId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string; fileName: string; contentType: string; size: number }> {
  return new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `collections/${userId}/${collectionId}/${itemId}/${safeName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir el archivo'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Upload contribution file (PDF)
 * Returns Promise with URL, storage path, and file metadata
 */
export function uploadContributionFile(
  file: File,
  userId: string,
  contributionId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string; fileName: string; contentType: string; size: number }> {
  return new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `contributions/${userId}/${contributionId}/${safeName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir el archivo'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
            fileName: file.name,
            contentType: file.type || 'application/pdf',
            size: file.size,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Delete collection file from Storage
 */
export async function deleteCollectionFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.error('Delete failed:', error);
    throw new Error('No se pudo eliminar el archivo');
  }
}

/**
 * Upload chat image + thumbnail
 */
export async function uploadConversationImage(
  file: File,
  thumbFile: File | null,
  conversationId: string,
  userId: string,
  messageId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string; thumbUrl: string | null; thumbPath: string | null }> {
  const safeName = sanitizeFileName(file.name);
  const storageName = `${Date.now()}_${safeName}`;
  const storagePath = `conversations/${conversationId}/attachments/${userId}/${messageId}/${storageName}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const url = await new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir la imagen'));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (error) {
          reject(error);
        }
      },
    );
  });

  let thumbUrl: string | null = null;
  let thumbPath: string | null = null;

  if (thumbFile) {
    const thumbSafeName = sanitizeFileName(thumbFile.name);
    const thumbStorageName = `${Date.now()}_${thumbSafeName}`;
    thumbPath = `conversations/${conversationId}/thumbnails/${userId}/${messageId}/${thumbStorageName}`;
    const thumbRef = ref(storage, thumbPath);
    try {
      await uploadBytes(thumbRef, thumbFile);
      thumbUrl = await getDownloadURL(thumbRef);
    } catch (error) {
      console.error('Thumbnail upload failed:', error);
    }
  }

  return { url, path: storagePath, thumbUrl, thumbPath };
}

/**
 * Upload chat file attachment
 */
export function uploadConversationFile(
  file: File,
  conversationId: string,
  userId: string,
  messageId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(file.name);
    const storageName = `${Date.now()}_${safeName}`;
    const storagePath = `conversations/${conversationId}/attachments/${userId}/${messageId}/${storageName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir el archivo'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Upload profile photo
 */
export function uploadProfilePhoto(
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `profiles/${userId}/avatar/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir la foto de perfil'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Upload group icon image
 */
export function uploadGroupIcon(
  file: File,
  ownerId: string,
  groupId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const storagePath = `groups/${ownerId}/${groupId}/icon/${Date.now()}.webp`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir la imagen del grupo'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/**
 * Upload story image + thumbnail
 */
export async function uploadStoryImage(
  file: File,
  thumbFile: File | null,
  userId: string,
  storyId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string; thumbUrl: string | null; thumbPath: string | null }> {
  const safeName = sanitizeFileName(file.name);
  const storageName = `${Date.now()}_${safeName}`;
  const storagePath = `stories/${userId}/${storyId}/original/${storageName}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const url = await new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir la historia'));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (error) {
          reject(error);
        }
      },
    );
  });

  let thumbUrl: string | null = null;
  let thumbPath: string | null = null;

  if (thumbFile) {
    const thumbSafeName = sanitizeFileName(thumbFile.name);
    const thumbStorageName = `${Date.now()}_${thumbSafeName}`;
    thumbPath = `stories/${userId}/${storyId}/thumb/${thumbStorageName}`;
    const thumbRef = ref(storage, thumbPath);
    try {
      await uploadBytes(thumbRef, thumbFile);
      thumbUrl = await getDownloadURL(thumbRef);
    } catch (error) {
      console.error('Thumbnail upload failed:', error);
    }
  }

  return { url, path: storagePath, thumbUrl, thumbPath };
}

/**
 * Upload story video
 */
export function uploadStoryVideo(
  file: File,
  userId: string,
  storyId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const safeName = sanitizeFileName(file.name);
    const storageName = `${Date.now()}_${safeName}`;
    const storagePath = `stories/${userId}/${storyId}/original/${storageName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error('Error al subir el video'));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path: uploadTask.snapshot.ref.fullPath,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}
