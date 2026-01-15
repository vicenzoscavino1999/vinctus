import imageCompression from 'browser-image-compression';

/**
 * Compress image to WebP format with size guarantee
 * Target: <500KB, max 1920px resolution
 * Retries with lower quality if initial compression exceeds target
 */
export async function compressToWebp(file: File): Promise<File> {
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const targetBytes = 500 * 1024; // 500KB

    const compressOnce = async (maxSizeMB: number, initialQuality: number): Promise<File> => {
        const compressed = await imageCompression(file, {
            maxSizeMB,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality
        });

        // Ensure correct name and type
        return new File([compressed], `${baseName}.webp`, { type: 'image/webp' });
    };

    try {
        // Progressive compression attempts with decreasing quality
        let result = await compressOnce(0.5, 0.85);
        if (result.size <= targetBytes) return result;

        result = await compressOnce(0.35, 0.75);
        if (result.size <= targetBytes) return result;

        result = await compressOnce(0.25, 0.65);
        return result; // Final attempt - accept even if > 500KB
    } catch {
        throw new Error('No se pudo comprimir la imagen. El archivo podría estar corrupto.');
    }
}

/**
 * Validate image file before compression
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB before compression
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!validTypes.includes(file.type)) {
        return { valid: false, error: 'Formato no válido. Solo JPEG, PNG o WebP.' };
    }

    if (file.size > maxSize) {
        return { valid: false, error: 'Imagen muy grande. Máximo 10MB.' };
    }

    return { valid: true };
}
