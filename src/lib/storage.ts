// Media upload service for Vinctus
// Handles photos and videos upload to Firebase Storage

import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from 'firebase/storage';
import { storage } from './firebase';

// ==================== Types ====================

export interface UploadProgress {
    bytesTransferred: number;
    totalBytes: number;
    progress: number; // 0-100
}

export interface UploadResult {
    url: string;
    path: string;
    filename: string;
    contentType: string;
    size: number;
    width?: number;
    height?: number;
}

export interface UploadOptions {
    onProgress?: (progress: UploadProgress) => void;
}

// ==================== Constants ====================

const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_CONCURRENT_UPLOADS = 3;

// ==================== Helpers ====================

function generateUniqueFilename(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = originalName.split('.').pop() || 'bin';
    return `${timestamp}_${random}.${ext}`;
}

function validateFile(file: File, type: 'image' | 'video'): void {
    const maxSizeMB = type === 'image' ? MAX_IMAGE_SIZE_MB : MAX_VIDEO_SIZE_MB;
    const allowedTypes = type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;

    if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`File too large. Max size: ${maxSizeMB}MB`);
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}`);
    }
}

// ==================== Concurrency Control ====================

/**
 * Execute promises with limited concurrency using worker pattern.
 * Prevents memory/network saturation with large video uploads.
 */
async function withConcurrencyLimit<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<T[]> {
    const results: T[] = [];
    const queue = [...tasks];

    const worker = async () => {
        while (queue.length > 0) {
            const task = queue.shift();
            if (task) {
                const result = await task();
                results.push(result);
            }
        }
    };

    // Spawn N workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

// ==================== Image Dimensions ====================

/**
 * Extract width and height from an image file.
 * Call this BEFORE uploading to avoid CLS (Cumulative Layout Shift).
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('Not an image file'));
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

// ==================== Upload Functions ====================

/**
 * Upload a single media file to Firebase Storage.
 */
export async function uploadPostMedia(
    userId: string,
    postId: string,
    file: File,
    type: 'image' | 'video',
    dimensions?: { width: number; height: number },
    options: UploadOptions = {}
): Promise<UploadResult> {
    validateFile(file, type);

    const filename = generateUniqueFilename(file.name);
    const folder = type === 'image' ? 'images' : 'videos';
    const path = `posts/${userId}/${postId}/${folder}/${filename}`;
    const storageRef = ref(storage, path);

    const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type
    });

    return new Promise((resolve, reject) => {
        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                options.onProgress?.({
                    bytesTransferred: snapshot.bytesTransferred,
                    totalBytes: snapshot.totalBytes,
                    progress
                });
            },
            (error) => reject(error),
            async () => {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({
                    url,
                    path,
                    filename,
                    contentType: file.type,
                    size: file.size,
                    width: dimensions?.width,
                    height: dimensions?.height
                });
            }
        );
    });
}

/**
 * Delete a media file from Storage.
 */
export async function deletePostMedia(path: string): Promise<void> {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
}

// ==================== Batch Upload (Controlled Concurrency) ====================

/**
 * Upload multiple media files with controlled concurrency (max 3 simultaneous).
 */
export async function uploadMultipleMedia(
    userId: string,
    postId: string,
    files: File[],
    type: 'image' | 'video'
): Promise<UploadResult[]> {
    const tasks = files.map((file) => async () => {
        let dimensions: { width: number; height: number } | undefined;
        if (type === 'image') {
            try {
                dimensions = await getImageDimensions(file);
            } catch {
                // Ignore dimension extraction errors
            }
        }
        return uploadPostMedia(userId, postId, file, type, dimensions);
    });

    return withConcurrencyLimit(tasks, MAX_CONCURRENT_UPLOADS);
}

// ==================== Upload with Rollback ====================

/**
 * Upload multiple media with automatic rollback on failure.
 * Returns cleanup function to delete uploaded files if post creation fails.
 */
export async function uploadMultipleMediaWithRollback(
    userId: string,
    postId: string,
    files: File[],
    type: 'image' | 'video'
): Promise<{ results: UploadResult[]; cleanup: () => Promise<void> }> {
    const results = await uploadMultipleMedia(userId, postId, files, type);

    const cleanup = async () => {
        await Promise.allSettled(
            results.map(r => deletePostMedia(r.path).catch(() => {
                // Ignore delete errors during cleanup
            }))
        );
    };

    return { results, cleanup };
}
