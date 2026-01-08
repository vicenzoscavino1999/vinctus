import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, MessageCircle, ArrowRight, Check } from 'lucide-react';
import { CATEGORIES } from '../data';
import { useAppState } from '../context';

// Mock group data (in real app, would fetch from API)
const GROUPS_DATA = {
    1: {
        id: 1,
        name: 'Exploradores Cuanticos',
        description: 'Grupo dedicado a discutir los ultimos avances en fisica cuantica, mecanica cuantica y teorias del universo. Compartimos papers, debates y experimentos mentales.',
        members: 2340,
        postsPerWeek: 45,
        categoryId: 'science',
        icon: 'âš›ï¸',
        recentPosts: [
            { id: 1, title: 'Nuevo experimento de entrelazamiento', author: 'Maria L.', time: '2h' },
            { id: 2, title: 'Discusion: Interpretacion de Copenhague vs Many Worlds', author: 'Carlos R.', time: '5h' },
            { id: 3, title: 'Paper: Quantum Computing Advances 2024', author: 'Ana M.', time: '1d' },
        ],
        topMembers: [
            { id: 1, name: 'Maria L.', role: 'Admin', posts: 234 },
            { id: 2, name: 'Carlos R.', role: 'Mod', posts: 189 },
            { id: 3, name: 'Ana M.', role: 'Miembro', posts: 156 },
        ]
    },
    2: {
        id: 2,
        name: 'Jazz & Vinilos',
        description: 'Para amantes del jazz en todas sus formas. Desde el bebop hasta el jazz fusion contemporaneo. Compartimos vinilos, conciertos y recomendaciones.',
        members: 956,
        postsPerWeek: 28,
        categoryId: 'music',
        icon: 'ðŸŽ·',
        recentPosts: [
            { id: 1, title: 'La magia de Ruben Blades en vivo', author: 'Pedro S.', time: '1h' },
            { id: 2, title: 'Vinilo del mes: Kind of Blue', author: 'Laura G.', time: '3h' },
        ],
        topMembers: [
            { id: 1, name: 'Pedro S.', role: 'Admin', posts: 312 },
            { id: 2, name: 'Laura G.', role: 'Miembro', posts: 98 },
        ]
    }
};

const GroupDetailPage = () => {
    const { groupId } = useParams();
    const navigate = useNavigate();

    // Use global state from context instead of localStorage directly
    const { isGroupJoined, toggleJoinGroup } = useAppState();

    const groupIdNum = parseInt(groupId, 10);
    const isValidId = !isNaN(groupIdNum) && GROUPS_DATA[groupIdNum];

    // If invalid ID, show error state
    if (!isValidId) {
        return (
            <div className="page-category pb-32 text-center pt-20">
                <p className="text-neutral-500 mb-4">Grupo no encontrado</p>
                <button
                    onClick={() => navigate('/discover')}
                    className="text-brand-gold hover:underline"
                >
                    Volver a Descubrir
                </button>
            </div>
        );
    }

    const isJoined = isGroupJoined(groupIdNum);
    const group = GROUPS_DATA[groupIdNum];
    const category = CATEGORIES.find(c => c.id === group.categoryId);

    const handleJoin = () => {
        toggleJoinGroup(groupIdNum);
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

            {/* Header */}
            <header className="mb-8">
                <div className="flex items-start gap-4 mb-4">
                    <span className="text-5xl">{group.icon}</span>
                    <div className="flex-1">
                        <h1 className="text-display-sm font-display text-white mb-2">{group.name}</h1>
                        <div className="flex items-center gap-3 text-neutral-500 text-sm">
                            <span className="flex items-center gap-1">
                                <Users size={14} />
                                {group.members.toLocaleString()} miembros
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageCircle size={14} />
                                {group.postsPerWeek} posts/semana
                            </span>
                        </div>
                    </div>
                </div>

                <p className="text-neutral-400 text-body-md mb-6">{group.description}</p>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleJoin}
                        className={`flex-1 py-3 rounded-button font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all btn-premium ${isJoined ? 'bg-brand-gold text-black' : 'bg-neutral-800 text-white hover:bg-neutral-700'
                            }`}
                    >
                        {isJoined ? <><Check size={18} /> Unido</> : 'Unirme al grupo'}
                    </button>
                    {category && (
                        <button
                            onClick={() => navigate(`/category/${category.id}`)}
                            className="px-4 py-3 rounded-button bg-surface-overlay border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-700 transition-colors"
                        >
                            Ver {category.label}
                        </button>
                    )}
                </div>
            </header>

            {/* Recent posts */}
            <section className="mb-8">
                <h2 className="text-heading-lg font-display text-white mb-4">Publicaciones recientes</h2>
                <div className="space-y-3 stagger-premium">
                    {group.recentPosts.map(post => (
                        <div
                            key={post.id}
                            className="bg-surface-overlay border border-neutral-800/50 rounded-card p-4 flex items-center justify-between card-premium cursor-pointer"
                        >
                            <div>
                                <p className="text-white font-medium mb-1">{post.title}</p>
                                <p className="text-neutral-500 text-sm">{post.author} Â· {post.time}</p>
                            </div>
                            <ArrowRight size={16} className="text-neutral-600" />
                        </div>
                    ))}
                </div>
            </section>

            {/* Top members */}
            <section>
                <h2 className="text-heading-lg font-display text-white mb-4">Miembros destacados</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {group.topMembers.map(member => (
                        <div
                            key={member.id}
                            className="bg-surface-overlay border border-neutral-800/50 rounded-card p-4 text-center"
                        >
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                                <span className="text-lg">{member.name.charAt(0)}</span>
                            </div>
                            <p className="text-white font-medium">{member.name}</p>
                            <p className="text-brand-gold text-xs uppercase tracking-wider">{member.role}</p>
                            <p className="text-neutral-500 text-xs mt-1">{member.posts} posts</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default GroupDetailPage;

