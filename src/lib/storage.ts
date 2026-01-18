import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
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
    onProgress?: (progress: UploadProgress) => void
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
                        totalBytes: snapshot.totalBytes
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
                        path: uploadTask.snapshot.ref.fullPath
                    });
                } catch (error) {
                    reject(error);
                }
            }
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
    onProgress?: (totalBytes: number, transferredBytes: number) => void
): Promise<Array<{ url: string; path: string; type: 'image' }>> {
    const progressMap: { [key: number]: UploadProgress } = {};

    const uploads = files.map((file, index) =>
        uploadPostImage(file, userId, postId, index, (progress) => {
            progressMap[index] = progress;

            // Calculate aggregate progress by bytes
            if (onProgress) {
                const totalBytes = Object.values(progressMap).reduce((sum, p) => sum + p.totalBytes, 0);
                const transferredBytes = Object.values(progressMap).reduce((sum, p) => sum + p.bytesTransferred, 0);
                onProgress(totalBytes, transferredBytes);
            }
        })
    );

    // Use allSettled to track which uploads succeeded/failed
    const results = await Promise.allSettled(uploads);

    // Check if any failed
    const failed = results.filter(r => r.status === 'rejected');
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
            })
        );

        // Throw the first error
        const firstError = failed[0];
        throw firstError.status === 'rejected' ? firstError.reason : new Error('Upload failed');
    }

    // All succeeded, return results with type
    return successful.map(s => ({ ...s.result, type: 'image' as const }));
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
    await Promise.all(mediaPaths.map(path => deletePostMedia(path)));
}

/**
 * Upload group icon image
 */
export function uploadGroupIcon(
    file: File,
    ownerId: string,
    groupId: string,
    onProgress?: (progress: UploadProgress) => void
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
                        totalBytes: snapshot.totalBytes
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
                        path: uploadTask.snapshot.ref.fullPath
                    });
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}
