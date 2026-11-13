import { Bookmark, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSavedPosts } from '@/features/posts/hooks/useSavedPosts';

export default function SavedPostsPanel({ uid }: { uid: string }) {
  const { items, loading, loadingMore, hasMore, error, load, retry } = useSavedPosts(uid);
  return (
    <section
      aria-label="Publicaciones guardadas"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Bookmark size={16} className="text-brand-gold" />
        <h2 className="text-xs tracking-[0.2em] text-neutral-400 uppercase">
          Publicaciones guardadas
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || loadingMore}
          aria-label="Actualizar publicaciones guardadas"
          className="ml-auto p-2 text-neutral-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {loading && items.length === 0 ? (
        <Loader2
          className="animate-spin text-neutral-500"
          size={20}
          aria-label="Cargando guardados"
        />
      ) : (
        items.length === 0 &&
        !error && (
          <p className="text-sm text-neutral-500">
            {hasMore
              ? 'No hay publicaciones disponibles en esta página.'
              : 'Aún no tienes publicaciones guardadas.'}
          </p>
        )
      )}
      <ul className="space-y-3">
        {items.map((post) => (
          <li key={post.postId}>
            <Link
              to={`/post/${post.postId}`}
              className="block rounded-lg border border-neutral-800 p-3 hover:border-neutral-600"
            >
              <p className="text-sm text-neutral-200 line-clamp-2">
                {post.title || post.text || post.content || 'Publicación'}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {post.authorSnapshot?.displayName || post.authorName || 'Usuario'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {error && (
        <div className="mt-3">
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={loading || loadingMore}
            className="text-sm text-brand-gold mt-2"
          >
            Reintentar guardados
          </button>
        </div>
      )}
      {hasMore && !error && (
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || loadingMore}
          className="mt-4 text-sm text-brand-gold disabled:opacity-50"
        >
          {loadingMore ? 'Cargando...' : 'Cargar más guardados'}
        </button>
      )}
    </section>
  );
}
