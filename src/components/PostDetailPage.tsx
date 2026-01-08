import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, MessageCircle, Bookmark, Share2, User } from 'lucide-react';

// Mock post data
const POSTS_DATA = {
    1: {
        id: 1,
        title: 'Un agujero negro revela secretos del universo temprano',
        content: `Los cientÃ­ficos han descubierto un agujero negro supermasivo que data de apenas 470 millones de aÃ±os despuÃ©s del Big Bang, desafiando las teorÃ­as actuales sobre la formaciÃ³n de estos gigantes cÃ³smicos.

Este hallazgo, publicado en Nature, sugiere que los agujeros negros primordiales podrÃ­an haberse formado de manera diferente a lo que pensÃ¡bamos. El equipo utilizÃ³ el telescopio James Webb para hacer estas observaciones sin precedentes.

"Es como encontrar un dinosaurio adulto en el registro fÃ³sil de cuando solo deberÃ­an existir huevos", explica la Dra. MarÃ­a RodrÃ­guez, coautora del estudio.

Las implicaciones de este descubrimiento podrÃ­an cambiar nuestra comprensiÃ³n de la cosmologÃ­a temprana y la evoluciÃ³n de las galaxias.`,
        author: {
            name: 'MarÃ­a L.',
            avatar: null,
            role: 'Investigadora'
        },
        group: {
            id: 1,
            name: 'Exploradores CuÃ¡nticos',
            icon: 'âš›ï¸'
        },
        publishedAt: 'Hace 2 horas',
        likes: 234,
        comments: 45,
        saved: false,
        image: '/blackhole.png'
    },
    2: {
        id: 2,
        title: 'La magia de RubÃ©n Blades en vivo',
        content: `Anoche tuve el privilegio de asistir al concierto de RubÃ©n Blades en el Auditorio Nacional. Una experiencia transformadora que me recordÃ³ por quÃ© la salsa es mucho mÃ¡s que mÃºsica: es poesÃ­a en movimiento.

El maestro abriÃ³ con "Pedro Navaja" y el pÃºblico enloqueciÃ³. Cada canciÃ³n era una historia, cada historia una lecciÃ³n de vida. A sus aÃ±os, sigue teniendo la energÃ­a de alguien que ama profundamente lo que hace.

Lo que mÃ¡s me impactÃ³ fue la interpretaciÃ³n de "Patria". En tiempos tan polarizados, escuchar esa letra cobra un significado especial.

Â¿Alguien mÃ¡s estuvo ahÃ­? Me encantarÃ­a leer sus impresiones.`,
        author: {
            name: 'Pedro S.',
            avatar: null,
            role: 'Coleccionista de vinilos'
        },
        group: {
            id: 2,
            name: 'Jazz & Vinilos',
            icon: 'ðŸŽ·'
        },
        publishedAt: 'Hace 1 hora',
        likes: 89,
        comments: 23,
        saved: true,
        image: '/jazz.png'
    }
};

const PostDetailPage = () => {
    const { postId } = useParams();
    const navigate = useNavigate();

    const postIdNum = parseInt(postId, 10);
    const isValidId = !isNaN(postIdNum) && POSTS_DATA[postIdNum];

    // If invalid ID, show error state
    if (!isValidId) {
        return (
            <div className="page-category pb-32 text-center pt-20">
                <p className="text-neutral-500 mb-4">Publicacion no encontrada</p>
                <button
                    onClick={() => navigate('/discover')}
                    className="text-brand-gold hover:underline"
                >
                    Volver a Descubrir
                </button>
            </div>
        );
    }

    const post = POSTS_DATA[postIdNum];

    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(post.saved);
    const [likeCount, setLikeCount] = useState(post.likes);

    // Reset state when postId changes
    useEffect(() => {
        setLiked(false);
        setSaved(post.saved);
        setLikeCount(post.likes);
    }, [postId, post.saved, post.likes]);

    const handleLike = () => {
        setLiked(!liked);
        setLikeCount(prev => liked ? prev - 1 : prev + 1);
    };

    return (
        <div className="page-category pb-32">
            {/* Back button */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-6 mt-4"
            >
                <ChevronLeft size={20} />
                <span className="text-sm">Volver</span>
            </button>

            {/* Group badge */}
            <button
                onClick={() => navigate(`/group/${post.group.id}`)}
                className="inline-flex items-center gap-2 bg-surface-overlay border border-neutral-800 rounded-full px-3 py-1.5 mb-6 hover:border-neutral-700 transition-colors"
            >
                <span>{post.group.icon}</span>
                <span className="text-sm text-neutral-400">{post.group.name}</span>
            </button>

            {/* Title */}
            <h1 className="text-display-sm md:text-display-md font-display text-white mb-6 leading-tight">
                {post.title}
            </h1>

            {/* Author info */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                    {post.author.avatar ? (
                        <img src={post.author.avatar} alt={post.author.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                        <User size={20} className="text-neutral-500" />
                    )}
                </div>
                <div>
                    <p className="text-white font-medium">{post.author.name}</p>
                    <p className="text-neutral-500 text-sm">{post.author.role} Â· {post.publishedAt}</p>
                </div>
            </div>

            {/* Image */}
            {post.image && (
                <div className="relative rounded-xl overflow-hidden mb-8 aspect-video bg-surface-overlay">
                    <img
                        src={post.image}
                        alt={post.title}
                        className="w-full h-full object-cover"
                    />
                </div>
            )}

            {/* Content */}
            <article className="prose prose-invert max-w-none mb-8">
                {post.content.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="text-neutral-300 text-body-md leading-relaxed mb-4">
                        {paragraph}
                    </p>
                ))}
            </article>

            {/* Actions */}
            <div className="flex items-center justify-between py-4 border-t border-b border-neutral-800/50">
                <div className="flex items-center gap-6">
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-2 transition-colors press-scale ${liked ? 'text-red-400' : 'text-neutral-500 hover:text-white'
                            }`}
                    >
                        <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
                        <span className="text-sm">{likeCount}</span>
                    </button>

                    <button className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors">
                        <MessageCircle size={20} />
                        <span className="text-sm">{post.comments}</span>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSaved(!saved)}
                        className={`transition-colors press-scale ${saved ? 'text-brand-gold' : 'text-neutral-500 hover:text-white'
                            }`}
                    >
                        <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
                    </button>

                    <button className="text-neutral-500 hover:text-white transition-colors">
                        <Share2 size={20} />
                    </button>
                </div>
            </div>

            {/* Comments placeholder */}
            <section className="mt-8">
                <h2 className="text-heading-lg font-display text-white mb-4">Comentarios ({post.comments})</h2>
                <div className="bg-surface-overlay border border-dashed border-neutral-800 rounded-card p-8 text-center">
                    <p className="text-neutral-500 italic">Los comentarios estarÃ¡n disponibles prÃ³ximamente</p>
                </div>
            </section>
        </div>
    );
};

export default PostDetailPage;

