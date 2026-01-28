import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Film, Image as ImageIcon, Loader2 } from 'lucide-react';
import { getPostsByUser, type PaginatedResult, type PostRead } from '../lib/firestore';

type MediaItem = {
    type: 'image' | 'video' | 'file';
    url: string;
    fileName?: string;
    contentType?: string;
    size?: number;
};

type ProfilePost = PostRead & {
    media?: MediaItem[];
    status?: string;
    text?: string;
    postId?: string;
};

type ProfilePostsGridProps = {
    userId: string | null | undefined;
    canView?: boolean;
};

const PAGE_SIZE = 12;

const getDisplayText = (post: ProfilePost): string => {
    const legacy = post.content ?? '';
    const current = post.text ?? '';
    return (legacy || current).trim();
};

const getFileExtension = (name: string | undefined): string | null => {
    if (!name) return null;
    const clean = name.split('?')[0];
    const ext = clean.split('.').pop();
    if (!ext) return null;
    return ext.toUpperCase();
};

const isReadyPost = (post: ProfilePost): boolean => {
    return !post.status || post.status === 'ready';
};

const ProfilePostsGrid = ({ userId, canView = true }: ProfilePostsGridProps) => {
    const navigate = useNavigate();
    const [posts, setPosts] = useState<ProfilePost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cursor, setCursor] = useState<PaginatedResult<PostRead>['lastDoc']>(null);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        let active = true;

        if (!userId || !canView) {
            setPosts([]);
            setCursor(null);
            setHasMore(false);
            setError(null);
            setLoading(false);
            return () => {
                active = false;
            };
        }

        const loadInitial = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getPostsByUser(userId, PAGE_SIZE);
                if (!active) return;
                const visible = result.items.filter((item) => isReadyPost(item as ProfilePost));
                setPosts(visible as ProfilePost[]);
                setCursor(result.lastDoc);
                setHasMore(result.hasMore);
            } catch (err) {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'No se pudieron cargar publicaciones.';
                setError(message);
            } finally {
                if (active) setLoading(false);
            }
        };

        void loadInitial();

        return () => {
            active = false;
        };
    }, [userId, canView]);

    const loadMore = async () => {
        if (!userId || !hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await getPostsByUser(userId, PAGE_SIZE, cursor ?? undefined);
            const visible = result.items.filter((item) => isReadyPost(item as ProfilePost));
            setPosts((prev) => [...prev, ...(visible as ProfilePost[])]);
            setCursor(result.lastDoc);
            setHasMore(result.hasMore);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudieron cargar mas publicaciones.';
            setError(message);
        } finally {
            setLoadingMore(false);
        }
    };

    if (!canView) {
        return (
            <section>
                <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Publicaciones</h2>
                <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                    <p className="text-white text-lg font-light mb-2">Cuenta privada</p>
                    <p className="text-neutral-500 text-sm">
                        Sigue a este usuario para ver sus publicaciones.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section>
            <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Publicaciones</h2>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 size={16} className="animate-spin" />
                    Cargando publicaciones...
                </div>
            ) : error ? (
                <div className="text-sm text-red-400">{error}</div>
            ) : posts.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-neutral-800 rounded-lg">
                    <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-500">
                        <ImageIcon size={22} />
                    </div>
                    <p className="text-neutral-500 text-sm">Aun no hay publicaciones.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {posts.map((post) => {
                            const postId = post.id || post.postId;
                            if (!postId) return null;
                            const media = (post.media ?? []) as MediaItem[];
                            const image = media.find((item) => item.type === 'image');
                            const video = media.find((item) => item.type === 'video');
                            const file = media.find((item) => item.type === 'file');
                            const mediaCount = media.length;
                            const displayText = getDisplayText(post);
                            const fileLabel = file?.fileName ?? file?.url;
                            const fileExt = getFileExtension(fileLabel) ?? 'ARCHIVO';

                            return (
                                <button
                                    key={postId}
                                    type="button"
                                    onClick={() => navigate(`/post/${postId}`)}
                                    className="group relative aspect-square overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 text-left"
                                >
                                    {image ? (
                                        <img
                                            src={image.url}
                                            alt={displayText || 'Publicacion'}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-black" />
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

                                    <div className="absolute inset-0 p-3 flex flex-col justify-end">
                                        {file && !image && !video ? (
                                            <div className="flex items-center gap-2 text-neutral-200 text-xs">
                                                <FileText size={14} />
                                                <span className="uppercase tracking-wide">{fileExt}</span>
                                            </div>
                                        ) : displayText ? (
                                            <p className="text-neutral-100 text-xs leading-snug line-clamp-3">
                                                {displayText}
                                            </p>
                                        ) : (
                                            <p className="text-neutral-400 text-xs">Publicacion</p>
                                        )}
                                    </div>

                                    <div className="absolute top-3 right-3 flex flex-col gap-2 text-neutral-200">
                                        {video && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wide">
                                                <Film size={12} />
                                                Video
                                            </span>
                                        )}
                                        {file && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wide">
                                                <FileText size={12} />
                                                Archivo
                                            </span>
                                        )}
                                    </div>

                                    {mediaCount > 1 && (
                                        <div className="absolute top-3 left-3 rounded-full bg-black/60 text-white text-[11px] px-2 py-1">
                                            +{mediaCount}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {hasMore && (
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="px-5 py-2 rounded-full border border-neutral-700 text-neutral-200 hover:text-white hover:border-neutral-500 transition-colors text-sm disabled:opacity-50"
                            >
                                {loadingMore ? 'Cargando...' : 'Ver mas'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default ProfilePostsGrid;
