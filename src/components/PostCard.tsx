import { Heart, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { KeyboardEvent, MouseEvent } from 'react';
import ExpertBadge from './ExpertBadge';
import { useAppState } from '../context';
import type { PostCardProps } from '../types';

// Helper to convert author name to URL slug
const authorToSlug = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
};

// PostCard component with clickable author and working likes
const PostCard = ({ post }: PostCardProps) => {
    const navigate = useNavigate();
    const { isPostLiked, toggleLikePost } = useAppState();

    const liked = isPostLiked(post.id);
    const likeCount = liked ? post.likes + 1 : post.likes;

    const handleAuthorClick = (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const slug = authorToSlug(post.author);
        navigate(`/user/${slug}`);
    };

    const handleLike = (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        toggleLikePost(post.id);
    };

    const handleComment = (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        // Navigate to post detail for comments
        navigate(`/post/${post.id}`);
    };

    return (
        <div className="group border-b border-neutral-900 py-10 hover:bg-neutral-900/20 transition-colors -mx-6 px-6 md:px-0 md:mx-0">
            <div className="flex flex-col md:flex-row md:items-baseline mb-4">
                <h3 className="text-xl md:text-2xl text-neutral-200 font-serif font-light mb-2 md:mb-0 md:mr-4 leading-snug group-hover:text-white transition-colors">
                    {post.title}
                </h3>
                <span className="text-xs text-neutral-600 font-sans tracking-wider uppercase">{post.group}</span>
            </div>
            <p className="text-neutral-400 text-sm md:text-base leading-relaxed mb-6 font-light max-w-2xl">
                {post.content}
            </p>
            <div className="flex items-center justify-between mt-4">
                <div
                    className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={handleAuthorClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAuthorClick(e); }}
                >
                    <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-serif text-neutral-400 border border-neutral-700">
                        {post.author.charAt(0)}
                    </div>
                    <span className="text-xs text-neutral-500 font-medium tracking-wide hover:text-white transition-colors">{post.author}</span>
                    {post.isExpert && <ExpertBadge />}
                </div>
                <div className="flex items-center space-x-6 text-neutral-600">
                    <button
                        onClick={handleLike}
                        aria-label="Me gusta"
                        className={`flex items-center space-x-2 transition-colors ${liked ? 'text-red-500' : 'hover:text-white'}`}
                    >
                        <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                        <span className="text-xs">{likeCount}</span>
                    </button>
                    <button
                        onClick={handleComment}
                        aria-label="Comentarios"
                        className="flex items-center space-x-2 hover:text-white transition-colors"
                    >
                        <MessageSquare size={14} />
                        <span className="text-xs">{post.comments}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PostCard;

