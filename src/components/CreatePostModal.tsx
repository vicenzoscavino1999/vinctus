import { useState, useRef } from 'react';
import { X, Image, Video, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreatePostModal = ({ isOpen, onClose }: CreatePostModalProps) => {
    const { user } = useAuth();
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!content.trim() || !user) return;

        setIsSubmitting(true);
        try {
            // TODO: Implement actual post creation using firestore.ts createPost
            // For now, just close and show success
            console.log('Creating post:', { content, userId: user.uid });

            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 500));

            setContent('');
            onClose();
        } catch (error) {
            console.error('Error creating post:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-lg mx-4 bg-[#141414] border border-neutral-800 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                    <h2 className="text-lg font-medium text-white">Nueva publicación</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* User info */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium">
                            {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </div>
                        <div>
                            <p className="text-white font-medium">{user?.displayName || 'Usuario'}</p>
                            <p className="text-neutral-500 text-sm">{user?.email || ''}</p>
                        </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="¿Qué estás pensando?"
                        className="w-full h-32 bg-transparent text-white placeholder-neutral-500 resize-none focus:outline-none text-base leading-relaxed"
                        maxLength={5000}
                        autoFocus
                    />

                    {/* Character count */}
                    <div className="text-right text-neutral-500 text-sm">
                        {content.length}/5000
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-800">
                    {/* Media buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            className="p-2.5 text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                            aria-label="Añadir imagen"
                            title="Añadir imagen"
                        >
                            <Image size={20} />
                        </button>
                        <button
                            className="p-2.5 text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                            aria-label="Añadir video"
                            title="Añadir video"
                        >
                            <Video size={20} />
                        </button>
                    </div>

                    {/* Submit button */}
                    <button
                        onClick={handleSubmit}
                        disabled={!content.trim() || isSubmitting}
                        className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-neutral-700 disabled:to-neutral-700 disabled:text-neutral-500 text-black font-medium rounded-xl transition-all duration-200 disabled:cursor-not-allowed flex items-center gap-2"
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
