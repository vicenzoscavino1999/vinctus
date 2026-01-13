import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, MessageCircle, Bookmark, Share2, User } from 'lucide-react';
import { useAppState } from '../context';

type PostDetailData = {
    id: string;
    title: string;
    content: string;
    author: {
        name: string;
        avatar: string | null;
        role: string;
    };
    group: {
        id: string;
        name: string;
        icon: string;
    };
    publishedAt: string;
    likes: number;
    comments: number;
    saved: boolean;
    image?: string;
};

// Mock post data
const POSTS_DATA: Record<string, PostDetailData> = {
    '1': {
        id: '1',
        title: 'Un agujero negro revela secretos del universo temprano',
        content: `Los científicos han descubierto un agujero negro supermasivo que data de apenas 470 millones de años después del Big Bang, desafiando las teorías actuales sobre la formación de estos gigantes cósmicos.

Este hallazgo, publicado en Nature, sugiere que los agujeros negros primordiales podrían haberse formado de manera diferente a lo que pensábamos. El equipo utilizó el telescopio James Webb para hacer estas observaciones sin precedentes.

"Es como encontrar un dinosaurio adulto en el registro fósil de cuando solo deberían existir huevos", explica la Dra. María Rodríguez, coautora del estudio.

Las implicaciones de este descubrimiento podrían cambiar nuestra comprensión de la cosmología temprana y la evolución de las galaxias.`,
        author: {
            name: 'María L.',
            avatar: null,
            role: 'Investigadora'
        },
        group: {
            id: '1',
            name: 'Exploradores Cuánticos',
            icon: '⚛️'
        },
        publishedAt: 'Hace 2 horas',
        likes: 234,
        comments: 45,
        saved: false,
        image: '/blackhole.png'
    },
    '2': {
        id: '2',
        title: 'Descubrimiento arqueológico en las ruinas de Angkor',
        content: `Un equipo internacional de arqueólogos ha descubierto un complejo de templos previamente desconocido en las profundidades de la selva camboyana, cerca de Angkor Wat. Utilizando tecnología LIDAR, revelaron estructuras que permanecieron ocultas durante siglos bajo la densa vegetación.

El hallazgo incluye lo que parece ser un centro ceremonial con inscripciones en sánscrito antiguo que datan del siglo IX. Los expertos creen que podría cambiar nuestra comprensión de la extensión del Imperio Jemer.

"Es como encontrar una nueva ciudad que nadie sabía que existía", comentó el Dr. Hernández, líder del proyecto. "Las inscripciones sugieren conexiones comerciales y culturales que no teníamos documentadas."

Las excavaciones continuarán durante los próximos tres años, con la esperanza de desenterrar más secretos de esta civilización fascinante.`,
        author: {
            name: 'Miguel H.',
            avatar: null,
            role: 'Arqueólogo'
        },
        group: {
            id: '2',
            name: 'Historia Viva',
            icon: '🏛️'
        },
        publishedAt: 'Hace 4 horas',
        likes: 245,
        comments: 18,
        saved: false,
        image: '/history.png'
    },
    '3': {
        id: '3',
        title: 'La evolución del jazz modal en Nueva York',
        content: `El jazz modal representa uno de los momentos más transformadores en la historia de la música estadounidense. Nacido en los clubes de Nueva York a finales de los años 50, este estilo rompió con las estructuras armónicas tradicionales del bebop.

Miles Davis, con su álbum "Kind of Blue" (1959), estableció las bases de lo que sería una revolución sonora. En lugar de seguir progresiones de acordes complejas, los músicos improvisaban sobre escalas modales, creando texturas más espaciosas y meditativas.

John Coltrane llevó esta exploración aún más lejos, fusionando espiritualidad con innovación musical. La influencia del jazz modal se extiende hasta hoy, desde el neo-soul hasta la música electrónica experimental.

¿Cuál es tu disco de jazz modal favorito? Me encantaría descubrir nuevas joyas.`,
        author: {
            name: 'Carlos M.',
            avatar: null,
            role: 'Historiador musical'
        },
        group: {
            id: '3',
            name: 'Melómanos Unidos',
            icon: '🎵'
        },
        publishedAt: 'Hace 3 horas',
        likes: 189,
        comments: 34,
        saved: false,
        image: '/jazz.png'
    },
    '4': {
        id: '4',
        title: 'Reflexiones sobre el existencialismo moderno',
        content: `En un mundo cada vez más conectado digitalmente pero desconectado humanamente, las preguntas fundamentales del existencialismo cobran nueva relevancia. ¿Qué significa ser auténtico en la era de las redes sociales? ¿Cómo encontramos sentido cuando los sistemas de creencias tradicionales se desvanecen?

Sartre nos decía que "la existencia precede a la esencia" - que somos arrojados al mundo sin un propósito predeterminado y debemos crear nuestro propio significado. Hoy, esta libertad radical se siente tanto liberadora como abrumadora.

Camus, por su parte, enfrentó el absurdo no con desesperación sino con rebeldía. "Hay que imaginar a Sísifo feliz", escribió. Quizás esa imagen del esfuerzo perpetuo sin garantía de éxito es más relevante que nunca para nuestra generación.

¿Cómo reconcilian ustedes la búsqueda de sentido con la incertidumbre contemporánea?`,
        author: {
            name: 'Ana R.',
            avatar: null,
            role: 'Profesora de filosofía'
        },
        group: {
            id: '4',
            name: 'Pensadores Libres',
            icon: '🤔'
        },
        publishedAt: 'Hace 5 horas',
        likes: 156,
        comments: 42,
        saved: false,
        image: '/philosophy.png'
    },
    '5': {
        id: '5',
        title: 'El futuro de la inteligencia artificial generativa',
        content: `Estamos viviendo un momento sin precedentes en la historia de la tecnología. Los modelos de lenguaje grande (LLMs) y las IAs generativas están transformando industrias enteras, desde la programación hasta el arte y la medicina.

Pero más allá del hype, hay preguntas fundamentales que debemos abordar: ¿Qué significa la creatividad cuando una máquina puede generar arte? ¿Cómo redefinimos el trabajo en un mundo donde las tareas cognitivas pueden ser automatizadas?

Como desarrolladores y usuarios de estas tecnologías, tenemos la responsabilidad de guiar su evolución. La ética de la IA no puede ser una reflexión posterior; debe ser parte integral del proceso de desarrollo.

Los próximos 10 años serán decisivos. La pregunta no es si la IA transformará la sociedad, sino cómo lo hará y quién decidirá los términos de esa transformación.

¿Qué aplicaciones de IA les entusiasman más? ¿Cuáles les preocupan?`,
        author: {
            name: 'Diego L.',
            avatar: null,
            role: 'Ingeniero de ML'
        },
        group: {
            id: '5',
            name: 'IA & Futuro',
            icon: '🤖'
        },
        publishedAt: 'Hace 6 horas',
        likes: 421,
        comments: 67,
        saved: true,
        image: '/technology.png'
    },
    '6': {
        id: '6',
        title: 'Rutas de senderismo en los Andes peruanos',
        content: `Después de tres semanas explorando los senderos menos conocidos de los Andes peruanos, regreso con el alma renovada y muchas historias que contar.

La ruta de Choquequirao sigue siendo una joya relativamente desconocida. A diferencia de Machu Picchu, aquí puedes caminar durante horas sin ver a otro turista. Las ruinas, igual de impresionantes, se revelan gradualmente mientras asciendes entre nubes y vegetación exuberante.

El Ausangate es otro mundo: paisajes lunares a más de 5,000 metros, lagunas de colores imposibles (la Laguna de los 7 Colores realmente merece su nombre), y la presencia silenciosa de las montañas sagradas.

Recomendaciones prácticas: aclimatarse al menos 3 días en Cusco, llevar capas de ropa para todos los climas, y contratar guías locales - no solo por seguridad, sino porque sus conocimientos enriquecen enormemente la experiencia.

¿Alguien ha hecho el trek de Salkantay? Estoy considerándolo para mi próximo viaje.`,
        author: {
            name: 'Lucía V.',
            avatar: null,
            role: 'Fotógrafa de naturaleza'
        },
        group: {
            id: '6',
            name: 'Aventureros',
            icon: '🏔️'
        },
        publishedAt: 'Hace 8 horas',
        likes: 287,
        comments: 29,
        saved: false,
        image: '/nature.png'
    }
};

const PostDetailPage = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();

    const postIdStr = postId || '';
    const post = POSTS_DATA[postIdStr];
    const isValidId = !!post;

    // Use AppState for persistence
    const { isPostLiked, toggleLikePost, isPostSaved, toggleSavePost } = useAppState();
    const liked = post ? isPostLiked(postIdStr) : false;
    const saved = post ? isPostSaved(postIdStr) : false;
    const postLikes = post?.likes ?? 0;
    const likeCount = postLikes + (liked ? 1 : 0);

    // If invalid ID, show error state
    if (!isValidId) {
        return (
            <div className="page-category pb-32 text-center pt-20">
                <p className="text-neutral-500 mb-4">Publicación no encontrada</p>
                <button
                    onClick={() => navigate('/discover')}
                    className="text-brand-gold hover:underline"
                >
                    Volver a Descubrir
                </button>
            </div>
        );
    }

    const handleLike = () => {
        toggleLikePost(postIdStr);
    };

    const handleSave = () => {
        toggleSavePost(postIdStr);
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
                    <p className="text-neutral-500 text-sm">{post.author.role} · {post.publishedAt}</p>
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
                        type="button"
                        onClick={handleSave}
                        aria-label={saved ? 'Quitar de guardados' : 'Guardar publicación'}
                        className={`transition-colors press-scale ${saved ? 'text-brand-gold' : 'text-neutral-500 hover:text-white'
                            }`}
                    >
                        <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
                    </button>

                    <button
                        type="button"
                        aria-label="Compartir publicación"
                        className="text-neutral-500 hover:text-white transition-colors"
                    >
                        <Share2 size={20} />
                    </button>
                </div>
            </div>

            {/* Comments placeholder */}
            <section className="mt-8">
                <h2 className="text-heading-lg font-display text-white mb-4">Comentarios ({post.comments})</h2>
                <div className="bg-surface-overlay border border-dashed border-neutral-800 rounded-card p-8 text-center">
                    <p className="text-neutral-500 italic">Los comentarios estarán disponibles próximamente</p>
                </div>
            </section>
        </div>
    );
};

export default PostDetailPage;
