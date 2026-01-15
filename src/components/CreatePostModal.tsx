import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { getNewPostId } from '../lib/firestore';
import { createPostUploading, updatePost } from '../lib/firestore-post-upload';
import { compressToWebp, validateImage } from '../lib/compression';
import { uploadPostImages, deletePostAllMedia } from '../lib/storage';

type SelectedImage = { file: File; url: string };

interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreatePostModal = ({ isOpen, onClose }: CreatePostModalProps) => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [text, setText] = useState('');
    const [images, setImages] = useState<SelectedImage[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });

    const imageInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setText('');
            setError(null);
            setIsSubmitting(false);
            setProgress({ percent: 0, transferred: 0, total: 0 });
            setImages((prev) => {
                if (prev.length === 0) return prev;
                prev.forEach(img => URL.revokeObjectURL(img.url));
                return [];
            });
        }
    }, [isOpen]);

    const canSubmit = !isSubmitting && (!!text.trim() || images.length > 0);

    const openImagePicker = () => imageInputRef.current?.click();

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        e.target.value = ''; // Allow reselecting same file
        setError(null);

        if (!picked.length) return;

        const remaining = Math.max(0, 4 - images.length);
        const limited = picked.slice(0, remaining);

        // Validate before compressing
        for (const f of limited) {
            const v = validateImage(f);
            if (!v.valid) {
                setError(v.error ?? 'Imagen inválida.');
                return;
            }
        }

        try {
            const compressed: File[] = [];
            for (const f of limited) {
                compressed.push(await compressToWebp(f));
            }

            const newImages: SelectedImage[] = compressed.map(file => ({
                file,
                url: URL.createObjectURL(file)
            }));

            setImages(prev => [...prev, ...newImages]);
        } catch (err: any) {
            setError(err.message || 'Error procesando imágenes');
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => {
            const updated = [...prev];
            URL.revokeObjectURL(updated[index].url);
            updated.splice(index, 1);
            return updated;
        });
    };

    const handleSubmit = async () => {
        if (!user) {
            setError('Debes iniciar sesión');
            return;
        }

        if (!text.trim() && images.length === 0) {
            setError('Escribe algo o selecciona imágenes');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setProgress({ percent: 0, transferred: 0, total: 0 });

        const postId = getNewPostId();
        let created = false;
        let uploadedMedia: Array<{ url: string; path: string; type: 'image' }> = [];

        try {
            await createPostUploading({
                postId,
                authorId: user.uid,
                authorSnapshot: {
                    displayName: user.displayName || 'Usuario',
                    photoURL: user.photoURL || null
                },
                text: text.trim()
            });
            created = true;

            if (images.length > 0) {
                uploadedMedia = await uploadPostImages(
                    images.map(i => i.file),
                    user.uid,
                    postId,
                    (total, transferred) => {
                        const percent = Math.round((transferred / total) * 100);
                        setProgress({ percent, transferred, total });
                    }
                );

                await updatePost(postId, {
                    media: uploadedMedia,
                    status: 'ready'
                });
            } else {
                await updatePost(postId, { status: 'ready' });
            }

            // Success - close modal and navigate to feed
            onClose();
            navigate('/feed');
        } catch (err: any) {
            console.error('Error creating post:', err);
            setError(err.message || 'Error al publicar');

            // Mark post as failed and cleanup any uploaded media
            if (created) {
                await updatePost(postId, { status: 'failed' }).catch(() => { });
            }
            if (uploadedMedia.length > 0) {
                await deletePostAllMedia(uploadedMedia.map(m => m.path)).catch((cleanupErr) => {
                    console.error('Cleanup error:', cleanupErr);
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // FIX: Conditional JSX render instead of early return
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h2 className="text-lg font-medium text-white">Crear Publicación</h2>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Author info */}
                    <div className="flex items-center gap-3 mb-4">
                        {user?.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName || 'Usuario'}
                                className="w-12 h-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium text-lg">
                                {(user?.displayName || 'U').charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-white font-medium">{user?.displayName || 'Usuario'}</p>
                            <p className="text-neutral-500 text-sm">{user?.email || ''}</p>
                        </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="¿Qué estás pensando?"
                        className="w-full h-32 bg-transparent text-white placeholder-neutral-500 resize-none focus:outline-none text-base leading-relaxed"
                        maxLength={5000}
                        autoFocus
                        disabled={isSubmitting}
                    />

                    {/* Character count */}
                    <div className="text-right text-neutral-500 text-sm">
                        {text.length}/5000
                    </div>

                    {/* Image previews */}
                    {images.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {images.map((img, index) => (
                                <div key={index} className="relative group">
                                    <img
                                        src={img.url}
                                        alt={`Preview ${index + 1}`}
                                        className="w-full h-40 object-cover rounded-lg"
                                    />
                                    {!isSubmitting && (
                                        <button
                                            onClick={() => removeImage(index)}
                                            className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Progress */}
                    {isSubmitting && progress.total > 0 && (
                        <div className="mt-4">
                            <div className="flex justify-between text-sm text-neutral-400 mb-2">
                                <span>Subiendo imágenes...</span>
                                <span>{progress.percent}%</span>
                            </div>
                            <div className="w-full bg-neutral-800 rounded-full h-2">
                                <div
                                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        <button
                            onClick={openImagePicker}
                            disabled={isSubmitting || images.length >= 4}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ImageIcon size={20} />
                            <span className="text-sm">Imágenes</span>
                        </button>
                        {images.length > 0 && (
                            <span className="text-xs text-neutral-500">
                                {images.length}/4
                            </span>
                        )}
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Publicando...
                            </>
                        ) : (
                            'Publicar'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreatePostModal;
