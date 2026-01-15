import { useEffect, useState } from 'react';
import {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Post type with BOTH schemas (new + legacy) for compatibility
type Post = {
    postId: string;

    // New schema
    authorSnapshot?: { displayName: string; photoURL: string | null };
    text?: string;
    status?: 'ready' | 'uploading' | 'failed';

    // Legacy schema
    content?: string;
    authorName?: string;
    authorUsername?: string;
    authorPhoto?: string | null;

    // Common
    media: { type: 'image'; url: string; path: string }[];
    createdAt: any;
};

const FeedPage = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingInitial, setLoadingInitial] = useState(true);

    // Initial load with getDocs (NO realtime to avoid pagination conflicts)
    useEffect(() => {
        const loadInitial = async () => {
            try {
                const q = query(
                    collection(db, 'posts'),
                    orderBy('createdAt', 'desc'),
                    limit(20)
                );

                const snap = await getDocs(q);
                const list = snap.docs.map((d) => ({ ...(d.data() as any), postId: d.id })) as Post[];
                const visible = list.filter((p) => !p.status || p.status === 'ready');
                setPosts(visible);
                setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
            } catch (error) {
                console.error('Error loading posts:', error);
            } finally {
                setLoadingInitial(false);
            }
        };

        loadInitial();
    }, []);

    // Load more posts (pagination)
    const loadMore = async () => {
        if (!lastVisible || loadingMore) return;
        setLoadingMore(true);

        try {
            const q2 = query(
                collection(db, 'posts'),
                orderBy('createdAt', 'desc'),
                startAfter(lastVisible),
                limit(20)
            );

            const snap = await getDocs(q2);
            const more = snap.docs.map((d) => ({ ...(d.data() as any), postId: d.id })) as Post[];
            const moreVisible = more.filter((p) => !p.status || p.status === 'ready');

            // Merge without duplicates using Map
            setPosts((prev) => {
                const seen = new Set(prev.map((p) => p.postId));
                const merged = [...prev];
                for (const p of moreVisible) {
                    if (!seen.has(p.postId)) merged.push(p);
                }
                return merged;
            });

            setLastVisible(snap.docs[snap.docs.length - 1] ?? lastVisible);
        } catch (error) {
            console.error('Error loading more posts:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    return (
        <div className="p-4 md:p-8">
            {loadingInitial ? (
                <div className="text-sm text-neutral-500 text-center py-8">Cargando posts...</div>
            ) : posts.length === 0 ? (
                <div className="text-sm text-neutral-500 text-center py-8">No hay posts todavía.</div>
            ) : (
                <div className="space-y-4 max-w-2xl mx-auto">
                    {posts.map((p) => {
                        // FALLBACK READS: Support both new and legacy schemas
                        const displayText = p.text ?? p.content ?? '';
                        const authorName = p.authorSnapshot?.displayName ?? p.authorName ?? 'Usuario';
                        const authorPhoto = p.authorSnapshot?.photoURL ?? p.authorPhoto ?? null;
                        const authorInitial = authorName.charAt(0).toUpperCase();

                        return (
                            <div key={p.postId} className="bg-[#1a1a1a] border border-neutral-800 rounded-xl p-4">
                                {/* Author info */}
                                <div className="flex items-center gap-3 mb-3">
                                    {authorPhoto ? (
                                        <img
                                            src={authorPhoto}
                                            alt={authorName}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium">
                                            {authorInitial}
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-white font-medium">{authorName}</p>
                                    </div>
                                </div>

                                {/* Text content */}
                                {displayText && <div className="text-neutral-200 mb-3 whitespace-pre-wrap">{displayText}</div>}

                                {/* Media grid */}
                                {p.media?.length > 0 && (
                                    <div className={`grid gap-2 ${p.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                        {p.media.map((m, i) => (
                                            <img
                                                key={i}
                                                src={m.url}
                                                alt={`media-${i}`}
                                                className="w-full h-64 object-cover rounded-lg"
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Load more button */}
            {lastVisible && (
                <div className="mt-6 flex justify-center">
                    <button
                        className="px-6 py-2.5 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={loadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? 'Cargando...' : 'Cargar más'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default FeedPage;
