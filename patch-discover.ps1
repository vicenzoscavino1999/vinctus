# PowerShell script to add user posts to DiscoverPage

$file = "src/pages/DiscoverPage.tsx"
$content = Get-Content $file -Raw

# 1. Add imports
$content = $content -replace "import \{ useState, useMemo, type ChangeEvent \} from 'react';", "import { useState, useMemo, useEffect, type ChangeEvent } from 'react';"
$content = $content -replace "(import \{ Search, BookOpen, Check, ArrowRight, Filter \} from 'lucide-react';)", "`$1`r`nimport { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';`r`nimport { db } from '../lib/firebase';"

# 2. Add types and helpers after SearchFiltersState
$typesAndHelpers = @"

// User post type with production safety
type UserPost = {
    postId: string;
    authorSnapshot: { displayName: string; photoURL: string | null } | null;
    text?: string;
    media?: { type: 'image'; url: string; path: string }[];
    createdAt: Timestamp | null;
};

// Helper: Relative timestamp with negative check
function getRelativeTime(timestamp: Timestamp | null): string {
    if (!timestamp) return 'Ahora';
    try {
        const date = timestamp.toDate();
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        if (diffMs < 0) return 'Ahora'; // Handle future timestamps
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Ahora';
        if (diffMins < 60) return ``Hace `${diffMins}m``;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return ``Hace `${diffHours}h``;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return ``Hace `${diffDays}d``;
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
        return 'Ahora';
    }
}

// User post card component
const UserPostCard = ({ post, onClick }: { post: UserPost; onClick: () => void }) => {
    const text = post.text ?? '';
    const media = post.media ?? [];
    const author = post.authorSnapshot ?? { displayName: 'Usuario', photoURL: null };
    const initialLetter = author.displayName.charAt(0).toUpperCase() || 'U';
    const hasImages = media.length > 0;
    const MAX_TEXT_LENGTH = 150;
    const isTruncated = text.length > MAX_TEXT_LENGTH;
    const displayText = isTruncated ? text.slice(0, MAX_TEXT_LENGTH) + '...' : text;

    return (
        <div onClick={onClick} className="bg-surface-1 border border-neutral-800/50 rounded-lg p-4 cursor-pointer hover:border-neutral-700 transition-all group">
            <div className="flex items-center gap-3 mb-3">
                {author.photoURL ? (
                    <img src={author.photoURL} alt={author.displayName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; const fallback = e.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.classList.remove('hidden'); }} />
                ) : null}
                <div className={``w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium flex-shrink-0 `${author.photoURL ? 'hidden' : ''}``}>
                    {initialLetter}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-white font-medium text-sm truncate">{author.displayName}</p>
                    <p className="text-neutral-500 text-xs">{getRelativeTime(post.createdAt)}</p>
                </div>
            </div>
            {text && (
                <div className="text-neutral-300 text-sm mb-3 leading-relaxed">
                    <p className="line-clamp-3">{displayText}</p>
                    {isTruncated && <span className="text-amber-500 text-xs hover:underline cursor-pointer">Ver más...</span>}
                </div>
            )}
            {hasImages && (
                <div className={``grid gap-2 mb-2 `${media.length === 1 ? 'grid-cols-1' : media.length === 2 ? 'grid-cols-2' : media.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}``}>
                    {media.slice(0, 4).map((m, i) => (
                        <div key={i} className={``relative rounded-lg overflow-hidden bg-neutral-800 `${media.length === 3 && i === 0 ? 'col-span-3' : ''}``}>
                            <img src={m.url} alt={``Media `${i + 1}``} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23262626" width="100" height="100"/%3E%3C/svg%3E'; }} />
                            {i === 3 && media.length > 4 && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                    <span className="text-white font-medium">+{media.length - 4}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center justify-between text-xs text-neutral-500 mt-2 pt-2 border-t border-neutral-800/50">
                <span>Ver publicación completa</span>
                <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    );
};
"@

$content = $content -replace "(\r?\n)const DiscoverPage", "$typesAndHelpers`r`n`r`nconst DiscoverPage"

# 3. Add state and useEffect after filters state
$stateAndEffect = @"

    // User posts state
    const [userPosts, setUserPosts] = useState<UserPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);

    // Fetch user posts (single fetch, not realtime)
    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const q = query(
                    collection(db, 'posts'),
                    where('status', '==', 'ready'),
                    orderBy('createdAt', 'desc'),
                    limit(6)
                );
                const snap = await getDocs(q);
                const posts = snap.docs.map((d) => ({
                    ...(d.data() as any),
                    postId: d.id
                })) as UserPost[];
                setUserPosts(posts);
            } catch (error) {
                console.error('Error fetching posts:', error);
            } finally {
               setLoadingPosts(false);
            }
        };
        fetchPosts();
    }, []);
"@

$content = $content -replace "(\s+const \[filters, setFilters\] = useState<SearchFiltersState>\(\{ category: null, sortBy: 'relevance' \}\);)", "`$1$stateAndEffect"

# 4. Add user posts section before closing </section>
$userPostsSection = @"

                {/* User posts: "De la comunidad" */}
                {userPosts.length > 0 && (
                    <div className="mt-12">
                        <h3 className="text-base font-light text-neutral-400 mb-6">De la comunidad</h3>

                        {loadingPosts ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="bg-surface-1 border border-neutral-800/50 rounded-lg p-4 h-48 animate-pulse">
                                        <div className="h-4 bg-neutral-800 rounded w-3/4 mb-3"></div>
                                        <div className="h-3 bg-neutral-800 rounded w-full mb-2"></div>
                                        <div className="h-3 bg-neutral-800 rounded w-5/6"></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {userPosts.map(post => (
                                    <UserPostCard
                                        key={post.postId}
                                        post={post}
                                        onClick={() => navigate(``/post/`${post.postId}``)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* "Ver todas" link */}
                        {userPosts.length >= 6 && (
                            <div className="flex justify-center mt-6">
                                <button
                                    onClick={() => navigate('/feed')}
                                    className="flex items-center gap-2 px-6 py-3 bg-neutral-800/50 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all"
                                >
                                    <span>Ver todas las publicaciones</span>
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
"@

# Find last </div> before </section> in Publications section
$content = $content -replace "(\s+</div>\r?\n\s+</section>\r?\n\s+</div>)", "$userPostsSection`r`n`$1"

# Write back
$content | Out-File -FilePath $file -Encoding utf8 -NoNewline

Write-Host "✅ DiscoverPage updated successfully"
"@
